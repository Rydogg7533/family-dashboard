"use server";
// Calendar writes go straight to Google (D72). Every write says who asked (activity_log) and re-reads the event from Google
// before reporting success, so "saved" means Google has it. Nothing is cached in the app.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { hasGoogleCal, insertEvent, updateEvent, deleteEvent, type EventInput, type GEvent } from "@/lib/google-calendar";

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
