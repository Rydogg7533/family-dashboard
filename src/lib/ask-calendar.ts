import "server-only";
// Ask → Google Calendar (D72). The model only READS the conversation into a draft; what is missing is decided here in code,
// so the same question is never skipped and never invented. Nothing is written until the person taps Confirm, and the write
// goes through saveEvent, which re-reads the event from Google before it says saved.
import { callModel, formatCost } from "@/lib/ai";
import { householdTz, hasGoogleCal } from "@/lib/google-calendar";
import type { AskReply, EventDraft, Turn } from "@/lib/ask-engine";
import { checkDay, freeSlots, fromMin, movable, short, to12, to24, toMin, whyNot } from "@/lib/ask-conflicts";

const todayParts = async () => {
  const tz = await householdTz();
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, tz };
};

const SYSTEM = (t: Awaited<ReturnType<typeof todayParts>>) => `You read a conversation with a family-calendar assistant and extract the calendar event the person wants. Today is ${t.weekday} ${t.date}, ${t.time}, time zone ${t.tz}. Reply with ONE JSON object and nothing else:
{"title":string|null,"date":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"allDay":boolean,"start":"HH:MM"|null,"end":"HH:MM"|null,"location":string|null,"reminders":number[]|null,"remindersDeclined":boolean,"guests":string[]}
Rules: never invent a value the person did not give or clearly imply; use null. Resolve "tomorrow", "Friday", "next week" from today's date. 24-hour times. "reminders" is minutes BEFORE the start for every notification the person asked for ("an hour before and a day before" = [60,1440]; "at the time" = [0]); null if they have not talked about notifications. If they said they want no reminder or notification, set "remindersDeclined" true. "guests" are email addresses only. A title is a short noun phrase ("Dentist, Ella"), not the whole sentence. Later messages in the conversation override earlier ones.`;

const clean = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;

export async function extractDraft(thread: Turn[]): Promise<{ draft: EventDraft; cost: number; model: string }> {
  const t = await todayParts();
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
  // The conflict chips carry their meaning in code, so they are read here and never shown to the model as new wishes.
  const last = thread[thread.length - 1]?.text ?? "";
  const keep = /^Keep this time anyway$/i.test(last);
  const mv = /^Move .+ to \d{1,2}:\d{2} [ap]m$/i.test(last);
  const use = last.match(/^Use (\d{1,2}:\d{2} [ap]m)–(\d{1,2}:\d{2} [ap]m)$/i);
  const { draft: d, cost, model } = await extractDraft(keep || mv || use ? thread.slice(0, -1) : thread);
  if (use) { d.start = to24(use[1]); d.end = to24(use[2]); }
  const ask = (text: string, chips?: string[]): AskReply => ({ kind: "event_clarify", text, chips, ...base(cost, model) });
  // One question at a time, in the order a person would ask.
  if (!d.title) return ask("What should I call the event?");
  if (!d.date) return ask(`What day is “${d.title}”?`, ["Today", "Tomorrow"]);
  if (!d.allDay && !d.start) return ask(`What time does “${d.title}” start?`, ["All day", "9:00 am", "12:00 pm", "3:00 pm"]);
  if (!d.allDay && !d.end && d.start) d.end = plusHour(d.start);   // Google's own default is one hour; stated in the card so it can be changed
  if (d.reminders === null) return ask("Do you want to set a notification for that?", ["10 min before", "1 hour before", "1 day before", "1 hour and 1 day before", "No reminder"]);

  let note = "";
  if (!d.allDay && d.start && d.end && !keep) {
    try {
      const { all, conflicts, len, near } = await checkDay(d.date, d.start, d.end);
      if (conflicts.length) {
        const mine = { s: toMin(d.start), e: toMin(d.end) };
        const list = conflicts.map((c) => `“${c.ev.title}” ${to12(c.ev.start!)}–${to12(c.ev.end ?? "23:59")} (${c.ev.calendarName})`).join("; ");
        // Moving the other event: only plain one-off events without guests, into a window that is free for it and clear of the new one.
        const moves = conflicts.filter((c) => movable(c.ev)).map((c) => ({ c, slots: freeSlots([...all.filter((b) => b.ev.id !== c.ev.id), { s: mine.s, e: mine.e, ev: c.ev }], c.e - c.s, c.s, 2) }));
        const stuck = conflicts.filter((c) => !movable(c.ev)).map((c) => `“${c.ev.title}” can't be moved from here because ${whyNot(c.ev)}`);
        const slots = freeSlots(all, len, near);
        const chips = [
          ...slots.map((x) => `Use ${to12(fromMin(x.s))}–${to12(fromMin(x.e))}`),
          ...moves.flatMap(({ c, slots: sl }) => sl.map((x) => `Move ${short(c.ev.title)} to ${to12(fromMin(x.s))}`)),
          "Keep this time anyway",
        ];
        if (mv) {
          const hit = moves.flatMap(({ c, slots: sl }) => sl.map((x) => ({ c, x }))).find(({ c, x }) => last === `Move ${short(c.ev.title)} to ${to12(fromMin(x.s))}`);
          if (hit) {
            const ns = fromMin(hit.x.s), ne = fromMin(hit.x.e);
            return { kind: "event_move", draft: d, move: { calendarId: hit.c.ev.calendarId, id: hit.c.ev.id, title: hit.c.ev.title, date: d.date, oldStart: hit.c.ev.start!, oldEnd: hit.c.ev.end ?? "", newStart: ns, newEnd: ne },
              text: `I'll move “${hit.c.ev.title}” from ${to12(hit.c.ev.start!)} to ${to12(ns)}–${to12(ne)}, then add:\n${describe(d)}\n\nNothing changes until you tap the button.`, ...base(cost, model) };
          }
        }
        return { kind: "event_conflict", draft: d, text: `That overlaps ${list}.${slots.length ? ` Same length, free that day: ${slots.map((x) => `${to12(fromMin(x.s))}–${to12(fromMin(x.e))}`).join(", ")}.` : " Nothing else is free that day between 8 am and 6 pm."}${stuck.length ? ` ${stuck.join("; ")}.` : ""}\n\nPick a new time for yours, move the other event, or keep both.`, chips, ...base(cost, model) };
      }
    } catch { note = " I couldn't check your calendar for conflicts just now."; }
  }
  const missingWhere = !d.location ? " No location set." : "";
  return { kind: "event_confirm", text: `Here is what I'll add to Google Calendar:\n${describe(d)}${missingWhere}${keep ? "\nYou chose to keep this time although it overlaps." : ""}${note}\n\nTap Add, or tell me what to change (for example “at the library”, “add a reminder 1 day before”, “make it 3 pm”).`, draft: d, ...base(cost, model) };
}
