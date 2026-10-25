import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { hasGoogleCal, listEvents, googleCalAccount } from "@/lib/google-calendar";
import { buildCandidates, eventsForPlaces, type Candidate, type ContactSpot, type Event, type Named, type Receipt, type Stop } from "@/lib/place-candidates";

// The signed-in person's unnamed stops, grouped into places, each with a suggested name only when receipts or the calendar point to one.
// RLS limits location_stops to the person's own rows, so this never sees anyone else's movements.
export async function getPlaceCandidates(): Promise<{ candidates: Candidate[]; pauses: number }> {
  if (!hasSupabaseEnv()) return { candidates: [], pauses: 0 };
  const sb = await createClient();
  const { data: stops } = await sb.from("location_stops").select("id,started_at,ended_at,lat,lon,address,status").eq("status", "question").order("started_at", { ascending: true }).limit(2000);
  const list = (stops ?? []) as Stop[];
  if (!list.length) return { candidates: [], pauses: 0 };
  const from = new Date(Date.parse(list[0].started_at) - 2 * 86_400_000).toISOString().slice(0, 10);
  // Calendar: only for the person who owns the household calendar token (person_connections kind "calendar"), read live from Google for the days the stops cover.
  // Anyone else's stops get no calendar suggestions, so one person's events never name another person's places.
  const liveEvents = async (): Promise<Event[]> => {
    try {
      if (!hasGoogleCal()) return [];
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return [];
      const { data: conn } = await sb.from("person_connections").select("account").eq("person", user.id).eq("kind", "calendar").eq("provider", "google").maybeSingle();
      if (!conn) return [];
      const last = list[list.length - 1].ended_at;
      const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Denver" });
      const toDate = day(last), fromDate = day(list[0].started_at);
      if ((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000 > 45) return [];   // a long backlog is not worth a long calendar read
      return eventsForPlaces(await listEvents(fromDate, toDate), (conn.account as string) || googleCalAccount());
    } catch { return []; }
  };
  const [{ data: rc }, live, { data: pl }, { data: cg }] = await Promise.all([
    sb.from("receipts").select("merchant,date").gte("date", from).is("duplicate_of", null).limit(2000),
    liveEvents(),
    sb.from("places").select("name,lat,lon").limit(500),
    sb.from("contact_geo").select("card_id,name,last_name,org,label,lat,lon,address_text,valid_until").eq("status", "ok").limit(3000),
  ]);
  const contacts: ContactSpot[] = ((cg ?? []) as Record<string, any>[]).filter((c) => c.lat != null && c.lon != null).map((c) => ({ cardId: c.card_id, name: c.name, lastName: c.last_name, org: c.org, label: c.label, lat: c.lat, lon: c.lon, address: c.address_text, validUntil: c.valid_until }));
  return { candidates: buildCandidates(list, (rc ?? []) as Receipt[], live, (pl ?? []) as Named[], contacts), pauses: 0 };
}
