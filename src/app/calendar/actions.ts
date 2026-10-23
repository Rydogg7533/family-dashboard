"use server";
// Calendar writes go straight to Google (D72). Every write says who asked (activity_log) and re-reads the event from Google
// before reporting success, so "saved" means Google has it. Nothing is cached in the app.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { hasGoogleCal, insertEvent, updateEvent, deleteEvent, getEvent, listEvents, rescheduleEvent, type EventInput, type GEvent } from "@/lib/google-calendar";

export type EventForm = EventInput & { id?: string; fromMessage?: string | null; origin?: { kind: string; ref: string | null; label: string } | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
function check(f: EventForm): string | null {
  if (!f.title?.trim()) return "Give the event a title.";
  if (!f.calendarId) return "Pick a calendar.";
  if (!DATE.test(f.date)) return "Pick a date.";
  if (f.endDate && !DATE.test(f.endDate)) return "The end date is not a date.";
  if (f.endDate && f.endDate < f.date) return "The end date is before the start.";
  if (!f.allDay) { if (!f.start || !TIME.test(f.start)) return "Pick a start time."; if (f.end && !TIME.test(f.end)) return "The end time is not a time."; if (f.end && (f.endDate || f.date) === f.date && f.end <= f.start) return "The end time is before the start."; }
  if ((f.reminders?.length ?? 0) > 5) return "Google allows at most 5 reminders on an event.";
  return null;
}
async function who() {
  if (!hasSupabaseEnv()) return { sb: null, actor: "preview" };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, actor: user?.email ?? null };
}
const when = (e: GEvent) => e.allDay ? `${e.date}${e.endDate !== e.date ? ` to ${e.endDate}` : ""} (all day)` : `${e.date} ${e.start}${e.end ? `–${e.end}` : ""}`;

export async function saveEvent(f: EventForm): Promise<{ ok: true; event: GEvent } | { ok: false; error: string }> {
  const bad = check(f); if (bad) return { ok: false, error: bad };
  if (!hasGoogleCal()) return { ok: false, error: "Google Calendar is not connected to the app yet (GOOGLE_CAL_* settings)." };
  const { sb, actor } = await who();
  if (sb && !actor) return { ok: false, error: "Not signed in." };
  try {
    const input: EventInput = { title: f.title, calendarId: f.calendarId, allDay: f.allDay, date: f.date, endDate: f.endDate, start: f.start, end: f.end, location: f.location, reminders: f.reminders, recurrence: f.recurrence, attendees: f.attendees,
      description: [f.description?.trim() || "", f.fromMessage ? `From a message: “${f.fromMessage.trim()}”` : "", `Added in StewardOS by ${actor ?? "a member"}${f.origin ? ` from ${f.origin.label}` : ""}`].filter(Boolean).join("\n\n") };
    const event = f.id ? await updateEvent(f.id, input) : await insertEvent(input);
    if (sb) await sb.from("activity_log").insert({ actor: actor!, action: f.id ? "event_updated" : "event_added", subject: `${event.title} · ${when(event)} · ${event.calendarName}${f.origin ? ` · from ${f.origin.label}` : ""}`, ref: `${event.calendarId}|${event.id}`, undoable: true }).then(() => {}, () => {});
    revalidatePath("/calendar"); revalidatePath("/day"); revalidatePath("/");
    return { ok: true, event };
  } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 200) }; }
}

export async function removeEvent(calendarId: string, id: string, title: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasGoogleCal()) return { ok: false, error: "Google Calendar is not connected." };
  const { sb, actor } = await who();
  if (sb && !actor) return { ok: false, error: "Not signed in." };
  try {
    await deleteEvent(calendarId, id);
    if (sb) await sb.from("activity_log").insert({ actor: actor!, action: "event_deleted", subject: title, ref: `${calendarId}|${id}`, undoable: false }).then(() => {}, () => {});
    revalidatePath("/calendar"); revalidatePath("/day"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 200) }; }
}

// Moves one existing event to a new time on its own day, only from the person's tap in Ask. It re-checks everything at the
// moment of the move: the event is still where we saw it, has no guests and no repeat, and the new window is still free.
export async function moveEventTime(m: { calendarId: string; id: string; date: string; oldStart: string; newStart: string; newEnd: string }, origin = "Ask"): Promise<{ ok: true; event: GEvent } | { ok: false; error: string }> {
  if (!hasGoogleCal()) return { ok: false, error: "Google Calendar is not connected." };
  if (!TIME.test(m.newStart) || !TIME.test(m.newEnd) || m.newEnd <= m.newStart) return { ok: false, error: "The new time is not valid." };
  const { sb, actor } = await who();
  if (sb && !actor) return { ok: false, error: "Not signed in." };
  try {
    const cur = await getEvent(m.calendarId, m.id);
    if (cur.allDay || cur.attendees.length || cur.recurringEventId || cur.recurrence?.length) return { ok: false, error: "That event has guests or repeats, so I won't move it from here." };
    if (cur.date !== m.date || cur.start !== m.oldStart) return { ok: false, error: "That event changed since I looked. Nothing was moved." };
    const clash = (await listEvents(m.date, m.date)).filter((e) => !e.allDay && e.start && e.end && e.date === m.date && e.endDate === m.date && !(e.id === m.id && e.calendarId === m.calendarId) && m.newStart < e.end && e.start < m.newEnd);
    if (clash.length) return { ok: false, error: `That window is no longer free (“${clash[0].title}”). Nothing was moved.` };
    const event = await rescheduleEvent(m.calendarId, m.id, m.date, m.newStart, m.newEnd);
    if (event.start !== m.newStart) return { ok: false, error: "Google did not keep the new time. Check the event." };
    if (sb) await sb.from("activity_log").insert({ actor: actor!, action: "event_updated", subject: `${event.title} · moved ${m.oldStart} → ${m.newStart} on ${m.date} · ${event.calendarName} · from ${origin}`, ref: `${event.calendarId}|${event.id}`, undoable: true }).then(() => {}, () => {});
    revalidatePath("/calendar"); revalidatePath("/day"); revalidatePath("/");
    return { ok: true, event };
  } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 200) }; }
}
