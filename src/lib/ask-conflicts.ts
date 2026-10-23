import "server-only";
// Conflict check and free windows for Ask (D72). Pure arithmetic on what Google returned; the model is not involved.
// Busy = timed events on that day across every calendar the app can see. All-day events (birthdays, trips) do not block.
import { listCalendars, listEvents, type GEvent } from "@/lib/google-calendar";

export const DAY_START = 8 * 60, DAY_END = 18 * 60, STEP = 30;
export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const to12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
export const to24 = (s: string) => { const m = s.match(/^(\d{1,2}):(\d{2}) ([ap])m$/i)!; let h = Number(m[1]) % 12; if (m[3].toLowerCase() === "p") h += 12; return `${String(h).padStart(2, "0")}:${m[2]}`; };
export const short = (t: string) => (t.length > 28 ? t.slice(0, 27) + "…" : t);

type Span = { s: number; e: number; ev: GEvent };
const spans = (evs: GEvent[], date: string): Span[] => evs.filter((e) => !e.allDay && e.start && e.date === date).map((e) => ({ s: toMin(e.start!), e: e.endDate === date && e.end ? toMin(e.end) : 24 * 60, ev: e })).filter((x) => x.e > x.s);

export const movable = (e: GEvent) => !e.allDay && e.attendees.length === 0 && !e.recurringEventId && !e.recurrence;
export const whyNot = (e: GEvent) => e.attendees.length ? "it has guests, and moving it would change their invitation" : e.recurringEventId || e.recurrence ? "it repeats" : "it is an all-day event";

// Free windows of a given length that day, nearest to `near` first (at most `max`, not overlapping each other).
export function freeSlots(busy: Span[], len: number, near: number, max = 3): { s: number; e: number }[] {
  const ok: { s: number; e: number }[] = [];
  for (let s = DAY_START; s + len <= DAY_END; s += STEP) if (!busy.some((b) => s < b.e && b.s < s + len)) ok.push({ s, e: s + len });
  ok.sort((a, b) => Math.abs(a.s - near) - Math.abs(b.s - near));
  const out: { s: number; e: number }[] = [];
  for (const c of ok) if (!out.some((o) => c.s < o.e && o.s < c.e)) out.push(c);
  return out.slice(0, max).sort((a, b) => a.s - b.s);
}

export async function checkDay(date: string, start: string, end: string) {
  const evs = await listEvents(date, date, await listCalendars());
  const all = spans(evs, date), s = toMin(start), e = toMin(end);
  const conflicts = all.filter((b) => s < b.e && b.s < e);
  return { all, conflicts, len: e - s, near: s };
}
