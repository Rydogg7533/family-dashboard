import { groupStops, type Stop } from "@/lib/place-candidates";

// Keeps the "Name N places" task equal to the Places list. The task rules live in the database function sync_name_places_task.
// The location agent does the same every 10 minutes; this runs right after a place is named, hidden, skipped or added so the count never lags the screen.
// Failure is silent on purpose: the agent corrects the count on its next run.
type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown> };
export async function syncNamePlacesTask(sb: Sb, person: string): Promise<void> {
  try {
    const { data } = await sb.from("location_stops").select("id,started_at,ended_at,lat,lon,address").eq("status", "question").eq("person", person).order("started_at", { ascending: true }).limit(2000);
    await sb.rpc("sync_name_places_task", { p_person: person, p_count: groupStops((data ?? []) as Stop[]).length });
  } catch { /* the agent will correct it */ }
}
