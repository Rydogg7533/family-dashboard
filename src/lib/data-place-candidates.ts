import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { buildCandidates, type Candidate, type Event, type Named, type Receipt, type Stop } from "@/lib/place-candidates";

// The signed-in person's unnamed stops, grouped into places, each with a suggested name only when receipts or the calendar point to one.
// RLS limits location_stops to the person's own rows, so this never sees anyone else's movements.
export async function getPlaceCandidates(): Promise<{ candidates: Candidate[]; pauses: number }> {
  if (!hasSupabaseEnv()) return { candidates: [], pauses: 0 };
  const sb = await createClient();
  const { data: stops } = await sb.from("location_stops").select("id,started_at,ended_at,lat,lon,address,status").eq("status", "question").order("started_at", { ascending: true }).limit(2000);
  const list = (stops ?? []) as Stop[];
  if (!list.length) return { candidates: [], pauses: 0 };
  const from = new Date(Date.parse(list[0].started_at) - 2 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: rc }, { data: ev }, { data: pl }] = await Promise.all([
    sb.from("receipts").select("merchant,date").gte("date", from).is("duplicate_of", null).limit(2000),
    sb.from("calendar_events").select("date,start_time,end_time,title,place").gte("date", from).limit(2000),
    sb.from("places").select("name,lat,lon").limit(500),
  ]);
  return { candidates: buildCandidates(list, (rc ?? []) as Receipt[], (ev ?? []) as Event[], (pl ?? []) as Named[]), pauses: 0 };
}
