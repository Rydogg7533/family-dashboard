import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { hasGoogleCal, listEvents } from "@/lib/google-calendar";
import { getChildRows } from "@/lib/data-children";

let last = 0;
// Way 2: look at the next three days of the calendar for timed evening events with no child named on them, and queue a question ("Is a sitter coming?").
// Nothing happens until a parent answers; "No" is remembered for that event. Throttled to once per 10 minutes per server instance.
export async function detectSitterNights(userId: string): Promise<void> {
  if (!hasSupabaseEnv() || !hasGoogleCal() || Date.now() - last < 10 * 60e3) return;
  last = Date.now();
  try {
    const kids = await getChildRows();
    if (!kids.length) return;
    const names = kids.map((k) => k.display_name.split(/\s+/)[0].toLowerCase()).filter((n) => n.length > 1);
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const events = await listEvents(day(0), day(3));
    const cand = events.filter((e) => !e.allDay && e.status !== "cancelled" && e.start && new Date(e.endIso) > new Date() && +e.start.slice(0, 2) >= 16 && +e.start.slice(0, 2) <= 23
      && !names.some((n) => e.title.toLowerCase().includes(n)) && !/\b(school|practice|lesson|game|recital|pickup|pick-up|drop off)\b/i.test(e.title));
    if (!cand.length) return;
    const sb = await createClient();
    const keys = cand.map((e) => `${e.calendarId}|${e.id}`);
    const { data: have } = await sb.from("sitter_nights").select("event_key").in("event_key", keys);
    const seen = new Set((have ?? []).map((r) => r.event_key));
    const fresh = cand.filter((e) => !seen.has(`${e.calendarId}|${e.id}`)).slice(0, 5);
    if (!fresh.length) return;
    await sb.from("sitter_nights").insert(fresh.map((e) => ({
      event_key: `${e.calendarId}|${e.id}`, title: e.title.slice(0, 200), place: e.location?.slice(0, 200) ?? null, source: "detected", status: "proposed", created_by: userId,
      starts_at: new Date(e.startIso).toISOString(), leave_at: new Date(new Date(e.startIso).getTime() - 30 * 60e3).toISOString(), ends_at: new Date(new Date(e.endIso).getTime() + 30 * 60e3).toISOString(),
    })));
  } catch { /* detection is a convenience; never break Today */ }
}
