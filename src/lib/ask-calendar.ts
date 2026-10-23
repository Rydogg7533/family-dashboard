import "server-only";
// Ask → Google Calendar (D72). The model only READS the conversation into a draft; what is missing is decided here in code,
// so the same question is never skipped and never invented. Nothing is written until the person taps Confirm, and the write
// goes through saveEvent, which re-reads the event from Google before it says saved.
import { callModel, formatCost } from "@/lib/ai";
import { HOUSEHOLD_TZ, hasGoogleCal } from "@/lib/google-calendar";
import type { AskReply, EventDraft, Turn } from "@/lib/ask-engine";

const todayParts = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: HOUSEHOLD_TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
};

const SYSTEM = (t: ReturnType<typeof todayParts>) => `You read a conversation with a family-calendar assistant and extract the calendar event the person wants. Today is ${t.weekday} ${t.date}, ${t.time}, time zone ${HOUSEHOLD_TZ}. Reply with ONE JSON object and nothing else:
{"title":string|null,"date":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"allDay":boolean,"start":"HH:MM"|null,"end":"HH:MM"|null,"location":string|null,"reminders":number[]|null,"remindersDeclined":boolean,"guests":string[]}
Rules: never invent a value the person did not give or clearly imply; use null. Resolve "tomorrow", "Friday", "next week" from today's date. 24-hour times. "reminders" is minutes BEFORE the start for every notification the person asked for ("an hour before and a day before" = [60,1440]; "at the time" = [0]); null if they have not talked about notifications. If they said they want no reminder or notification, set "remindersDeclined" true. "guests" are email addresses only. A title is a short noun phrase ("Dentist, Ella"), not the whole sentence. Later messages in the conversation override earlier ones.`;

const clean = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;

export async function extractDraft(thread: Turn[]): Promise<{ draft: EventDraft; cost: number; model: string }> {
  const t = todayParts();
  const r = await callModel({ job: "chat", feature: "ask-event", maxTokens: 400, system: SYSTEM(t), messages: [{ role: "user", content: thread.map((x) => `${x.role === "user" ? "Person" : "Assistant"}: ${x.text}`).join("\n") }] });
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* an unreadable answer is treated as nothing understood */ }
  const rem = Array.isArray(j.reminders) ? (j.reminders as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 40320).slice(0, 5) : null;
  const date = typeof j.date === "string" && DATE.test(j.date) ? j.date : null;
  const draft: EventDraft = {
    title: clean(j.title), date,
    endDate: typeof j.endDate === "string" && DATE.test(j.endDate) && date && j.endDate >= date ? j.endDate : null,
    allDay: j.allDay === true,
    start: typeof j.start === "string" && TIME.test(j.start) ? j.start : null,
    end: typeof j.end === "string" && TIME.test(j.end) ? j.end : null,
    location: clean(j.location),
    reminders: j.remindersDeclined === true ? [] : rem,
    guests: Array.isArray(j.guests) ? (j.guests as unknown[]).filter((e): e is string => typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) : [],
  };
  return { draft, cost: r.cost, model: r.model };
}

const plusHour = (t: string) => { const [h, m] = t.split(":").map(Number); return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
export const remLabel = (m: number) => m === 0 ? "at the time" : m % 10080 === 0 ? `${m / 10080} week${m / 10080 > 1 ? "s" : ""} before` : m % 1440 === 0 ? `${m / 1440} day${m / 1440 > 1 ? "s" : ""} before` : m % 60 === 0 ? `${m / 60} hour${m / 60 > 1 ? "s" : ""} before` : `${m} min before`;
export const describe = (d: EventDraft) => `${d.title} · ${d.date}${d.allDay ? " (all day)" : ` ${d.start}–${d.end}`}${d.location ? ` · ${d.location}` : ""} · ${d.reminders?.length ? d.reminders.map(remLabel).join(", ") : "no reminder"}${d.guests.length ? ` · guests: ${d.guests.join(", ")}` : ""}`;

export async function eventTurn(thread: Turn[]): Promise<AskReply> {
  const base = (cost: number, model: string) => ({ cost, costText: `this answer ~${formatCost(cost)}`, model, sample: false });
  if (!hasGoogleCal()) return { kind: "answer", text: "Google Calendar isn't connected to the app yet, so I can't add events.", ...base(0, "none") };
  const { draft: d, cost, model } = await extractDraft(thread);
  const ask = (text: string, chips?: string[]): AskReply => ({ kind: "event_clarify", text, chips, ...base(cost, model) });
  // One question at a time, in the order a person would ask.
  if (!d.title) return ask("What should I call the event?");
  if (!d.date) return ask(`What day is “${d.title}”?`, ["Today", "Tomorrow"]);
  if (!d.allDay && !d.start) return ask(`What time does “${d.title}” start?`, ["All day", "9:00 am", "12:00 pm", "3:00 pm"]);
  if (!d.allDay && !d.end && d.start) d.end = plusHour(d.start);   // Google's own default is one hour; stated in the card so it can be changed
  if (d.reminders === null) return ask("Do you want to set a notification for that?", ["10 min before", "1 hour before", "1 day before", "1 hour and 1 day before", "No reminder"]);
  const missingWhere = !d.location ? " No location set." : "";
  return { kind: "event_confirm", text: `Here is what I'll add to Google Calendar:\n${describe(d)}${missingWhere}\n\nTap Add, or tell me what to change (for example “at the library”, “add a reminder 1 day before”, “make it 3 pm”).`, draft: d, ...base(cost, model) };
}
