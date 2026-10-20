// Slice C data: the day (F3), weather on blocks (F5), checklists (F6), calendar (F5/F12), recurring register.
// Same pattern as data.ts: types, sample data, readers that fall back to samples when Supabase is unset.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Weather } from "@/lib/c-shared";
export type { Weather } from "@/lib/c-shared";
export { fmtTime, shortTime, fmtDate, daysUntil, weatherGlyph, weatherLine } from "@/lib/c-shared";
import { fmtTime } from "@/lib/c-shared";
export type ChecklistItem = { id: string; label: string; layer: "always" | "today" | "done_before"; packed: boolean; weather?: boolean; learned?: boolean; added_by: string };
export type Checklist = { id: string; activity: string; items: ChecklistItem[]; draft?: boolean };
export type BlockKind = "calendar" | "inferred" | "free" | "unknown";
export type DayBlock = {
  id: string; start: string; end: string; title: string; place: string | null; person: string;
  kind: BlockKind; confidence: number | null;   // confidence only for inferred/unknown gaps (0..1)
  travel_min: number | null; driving?: string;   // who is driving, if a child's block
  requested_by: string;                         // who put it there: "Melissa added", "System · from Overland"
  weather: Weather | null; checklist: Checklist | null;
  source: { name: string; href: string };       // "Open in Google Calendar" etc.
};
export type DayQuestion = { id: string; window: string; place_label: string; suggestions: string[]; days_waiting: number; for_person: string };
export type DayRecordEntry = { id: string; start: string; end: string; title: string; place: string | null; how: "calendar" | "inferred" | "answered" | "private"; learned?: string };
export type SyncStatus = { key: "calendar" | "location" | "messages" | "orders" | "weather"; label: string; state: "ok" | "warn" | "error"; last_sync: string; note?: string };
export type CalendarEvent = {
  id: string; date: string; start: string | null; end: string | null; title: string; place: string | null; person: string;
  weather: Weather | null; trip: boolean; from_message?: string; source: { name: string; href: string }; requested_by: string;
};
export type RecurringItem = {
  id: string; name: string; kind: "renewal" | "subscription" | "bill" | "event"; next_due: string; cycle: string; who: string;
  entity: string | null; amount_note: string | null; reminders: string[]; source: { name: string; href: string }; status: "ok" | "soon" | "overdue"; requested_by: string;
};

// ---- sample data ----
const d = (days: number) => { const x = new Date(); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
const gcal = { name: "Google Calendar", href: "https://calendar.google.com" };
const places = { name: "Places", href: "/places" };

const soccerList: Checklist = { id: "cl-soccer", activity: "Soccer practice", items: [
  { id: "i1", label: "Cleats", layer: "always", packed: true, added_by: "Ryan added" },
  { id: "i2", label: "Shin guards", layer: "always", packed: true, added_by: "Ryan added" },
  { id: "i3", label: "Water bottle", layer: "always", packed: false, added_by: "Melissa added" },
  { id: "i4", label: "Rain jacket", layer: "today", packed: false, weather: true, added_by: "System · from the forecast" },
  { id: "i5", label: "Snack for after", layer: "done_before", packed: false, learned: true, added_by: "Ryan added last time" },
] };
const workshopList: Checklist = { id: "cl-workshop", activity: "Workshop", items: [
  { id: "w1", label: "Laptop", layer: "always", packed: true, added_by: "Ryan added" },
  { id: "w2", label: "Shipping labels", layer: "today", packed: false, added_by: "System · from a SHVR task" },
  { id: "w3", label: "Light jacket", layer: "today", packed: false, weather: true, added_by: "System · from the forecast" },
] };
const dentistList: Checklist = { id: "cl-dentist", activity: "Dentist", draft: true, items: [
  { id: "d1", label: "Insurance card (1Password)", layer: "always", packed: false, added_by: "System · draft for dentist visits" },
  { id: "d2", label: "Umbrella", layer: "today", packed: false, weather: true, added_by: "System · from the forecast" },
] };

const sampleBlocks: DayBlock[] = [
  { id: "b1", start: "08:00", end: "08:30", title: "School drop-off", place: "[School]", person: "Ryan", kind: "calendar", confidence: null, travel_min: 12, weather: { temp: 34, note: "Cold start", icon: "cloud" }, checklist: null, source: gcal, requested_by: "Ryan added" },
  { id: "b2", start: "08:45", end: "12:30", title: "Workshop", place: "SHVR workshop", person: "Ryan", kind: "inferred", confidence: 0.92, travel_min: 10, weather: { temp: 41, hi: 52, note: "Clearing, light wind", icon: "sun", wind: 8 }, checklist: workshopList, source: places, requested_by: "System · from Overland" },
  { id: "b3", start: "12:30", end: "13:30", title: "Free", place: null, person: "Ryan", kind: "free", confidence: null, travel_min: null, weather: { temp: 54, note: "Mild", icon: "sun" }, checklist: null, source: gcal, requested_by: "System · free window" },
  { id: "b4", start: "13:30", end: "14:30", title: "Dentist", place: "[Dentist], Orem", person: "Melissa", kind: "calendar", confidence: null, travel_min: 15, weather: { temp: 57, precip: 20, note: "Clouds building", icon: "cloud" }, checklist: dentistList, source: { name: "Apple Calendar", href: "#" }, requested_by: "Melissa added" },
  { id: "b5", start: "15:15", end: "15:45", title: "Pickup → soccer", place: "[School] → [Field]", person: "Ryan", kind: "calendar", confidence: null, travel_min: 18, driving: "Ryan", weather: { temp: 58, precip: 70, note: "Rain from 3 pm", icon: "rain" }, checklist: null, source: gcal, requested_by: "Melissa added" },
  { id: "b6", start: "16:30", end: "18:00", title: "Soccer practice", place: "[Field], Orem", person: "[Child 1]", kind: "calendar", confidence: null, travel_min: null, driving: "Ryan", weather: { temp: 55, precip: 70, note: "Rain", icon: "rain" }, checklist: soccerList, source: { name: "Team calendar", href: "#" }, requested_by: "System · from the team calendar" },
  { id: "b7", start: "18:00", end: "19:00", title: "Unknown stop", place: "540 W Center St, Orem", person: "Ryan", kind: "unknown", confidence: 0.35, travel_min: null, weather: { temp: 50, precip: 40, note: "Showers ending", icon: "rain" }, checklist: null, source: places, requested_by: "System · from Overland" },
];

const sampleQuestions: DayQuestion[] = [
  { id: "q1", window: "Yesterday 2:10–3:40 pm", place_label: "540 W Center St, Orem", suggestions: ["Costco, Orem", "Errand", "Personal", "Skip"], days_waiting: 1, for_person: "Ryan" },
  { id: "q2", window: "Yesterday 7:05–7:50 pm", place_label: "near [Park], Orem", suggestions: ["Walk", "Soccer pickup", "Personal", "Skip"], days_waiting: 1, for_person: "Ryan" },
  { id: "q3", window: "Thu 11:30 am–12:15 pm", place_label: "[Restaurant], Provo", suggestions: ["Client lunch (business)", "Lunch (personal)", "Skip"], days_waiting: 3, for_person: "Ryan" },
];

const sampleRecord: DayRecordEntry[] = [
  { id: "r1", start: "08:00", end: "08:30", title: "School drop-off", place: "[School]", how: "calendar" },
  { id: "r2", start: "08:50", end: "12:20", title: "Workshop", place: "SHVR workshop", how: "inferred", learned: "usual Tue/Thu morning" },
  { id: "r3", start: "12:35", end: "13:10", title: "Lunch", place: "Home", how: "inferred" },
  { id: "r4", start: "14:10", end: "15:40", title: "?", place: "540 W Center St, Orem", how: "answered" },
  { id: "r5", start: "16:00", end: "17:30", title: "Private time", place: null, how: "private" },
  { id: "r6", start: "19:05", end: "19:50", title: "?", place: "near [Park]", how: "answered" },
];

const sampleSync: SyncStatus[] = [
  { key: "calendar", label: "Calendar", state: "ok", last_sync: h(0.2), note: "Google Calendar (Ryan), Apple Calendar (Melissa), 2 team calendars" },
  { key: "location", label: "Location", state: "ok", last_sync: h(0.5), note: "Ryan's iPhone · private to Ryan" },
  { key: "weather", label: "Weather", state: "ok", last_sync: h(1), note: "Hourly forecast, Orem" },
  { key: "messages", label: "Messages mirror", state: "ok", last_sync: h(0.1), note: "Mac mini, family threads, last 30 days" },
  { key: "orders", label: "Orders (from email)", state: "ok", last_sync: h(2), note: "Amazon, Smith's, Costco emails" },
];

const sampleEvents: CalendarEvent[] = [
  { id: "e1", date: d(0), start: "08:00", end: "08:30", title: "School drop-off", place: "[School]", person: "Ryan", weather: { temp: 34, note: "Cold start", icon: "cloud" }, trip: false, source: gcal, requested_by: "Ryan added" },
  { id: "e2", date: d(0), start: "13:30", end: "14:30", title: "Dentist", place: "[Dentist], Orem", person: "Melissa", weather: { temp: 57, precip: 20, note: "Clouds", icon: "cloud" }, trip: false, source: { name: "Apple Calendar", href: "#" }, requested_by: "Melissa added" },
  { id: "e3", date: d(0), start: "16:30", end: "18:00", title: "Soccer practice", place: "[Field], Orem", person: "[Child 1]", weather: { temp: 55, precip: 70, note: "Rain", icon: "rain" }, trip: false, source: { name: "Team calendar", href: "#" }, requested_by: "System · from the team calendar" },
  { id: "e4", date: d(1), start: "09:00", end: "10:30", title: "Church", place: "[Church]", person: "Family", weather: { temp: 48, note: "Sunny", icon: "sun" }, trip: false, source: gcal, requested_by: "Ryan added" },
  { id: "e5", date: d(1), start: "14:00", end: "16:00", title: "[Family event]", place: "[Park], Orem", person: "Family", weather: { temp: 60, wind: 18, note: "Windy afternoon", icon: "wind" }, trip: false, source: gcal, requested_by: "Melissa added" },
  { id: "e6", date: d(1), start: "16:00", end: "16:30", title: "Pick up [Child 1]", place: "[School]", person: "Ryan", weather: { temp: 58, note: "Clear", icon: "sun" }, trip: false, from_message: "Melissa: can someone grab [Child 1] at 4 tomorrow?", source: gcal, requested_by: "Melissa asked · from Messages" },
  { id: "e7", date: d(3), start: "15:00", end: "16:00", title: "Piano lesson", place: "[Teacher's house]", person: "[Child 1]", weather: { temp: 52, note: "Overcast", icon: "cloud" }, trip: false, source: gcal, requested_by: "Melissa added" },
  { id: "e8", date: d(4), start: "16:30", end: "18:00", title: "Soccer practice", place: "[Field], Orem", person: "[Child 1]", weather: { temp: 45, precip: 30, note: "Chance of showers", icon: "cloud" }, trip: false, source: { name: "Team calendar", href: "#" }, requested_by: "System · from the team calendar" },
  { id: "e9", date: d(5), start: "10:00", end: "11:00", title: "Tahoe emissions test", place: "[Station], Orem", person: "Ryan", weather: { temp: 49, note: "Sunny", icon: "sun" }, trip: false, source: { name: "Vehicles", href: "/vehicles" }, requested_by: "System · from Vehicles" },
  { id: "e10", date: d(12), start: null, end: null, title: "Beach house (3 nights)", place: "[Beach house]", person: "Family", weather: { temp: 68, hi: 72, precip: 10, note: "Mostly sunny all 3 days", icon: "sun" }, trip: true, source: gcal, requested_by: "Ryan added" },
];

const sampleRecurring: RecurringItem[] = [
  { id: "rc1", name: "Home insurance renewal", kind: "renewal", next_due: d(9), cycle: "Yearly", who: "Ryan", entity: "Personal", amount_note: "$[AMOUNT]", reminders: ["30 days", "7 days"], source: { name: "Subscriptions register", href: "#" }, status: "soon", requested_by: "System · from the insurance email" },
  { id: "rc2", name: "Tahoe registration", kind: "renewal", next_due: d(22), cycle: "Yearly", who: "Ryan", entity: "Personal", amount_note: null, reminders: ["30 days", "7 days"], source: { name: "Vehicles", href: "/vehicles" }, status: "soon", requested_by: "System · from Vehicles" },
  { id: "rc3", name: "Sienna insurance card expiry", kind: "renewal", next_due: d(41), cycle: "6 months", who: "Melissa", entity: "Personal", amount_note: null, reminders: ["14 days"], source: { name: "Vehicles", href: "/vehicles" }, status: "ok", requested_by: "System · from Vehicles" },
  { id: "rc4", name: "iCloud 2 TB", kind: "subscription", next_due: d(3), cycle: "Monthly", who: "Ryan", entity: "Personal", amount_note: "card ·· 4412", reminders: ["price change only"], source: { name: "Subscriptions register", href: "#" }, status: "ok", requested_by: "Ryan added" },
  { id: "rc5", name: "Vercel Pro", kind: "subscription", next_due: d(14), cycle: "Monthly", who: "Ryan", entity: "Veil Labs", amount_note: "card ·· 8830", reminders: ["price change only"], source: { name: "Subscriptions register", href: "#" }, status: "ok", requested_by: "Ryan added" },
  { id: "rc6", name: "Piano lessons (term fee)", kind: "bill", next_due: d(-2), cycle: "Per term", who: "Melissa", entity: "Personal", amount_note: "$[AMOUNT]", reminders: ["7 days"], source: { name: "Email", href: "#" }, status: "overdue", requested_by: "System · from the piano teacher's email" },
  { id: "rc7", name: "Furnace filter change", kind: "event", next_due: d(6), cycle: "Every 90 days", who: "Ryan", entity: "Home", amount_note: null, reminders: ["on the day"], source: { name: "Home register", href: "/home" }, status: "soon", requested_by: "Ryan added" },
  { id: "rc8", name: "Irrigation blow-out", kind: "event", next_due: d(18), cycle: "Yearly, fall", who: "Ryan", entity: "Home", amount_note: null, reminders: ["14 days"], source: { name: "Home register", href: "/home" }, status: "ok", requested_by: "Ryan added" },
  { id: "rc9", name: "SHVR.co domain", kind: "renewal", next_due: d(120), cycle: "Yearly", who: "Ryan", entity: "SHVR", amount_note: null, reminders: ["30 days"], source: { name: "Subscriptions register", href: "#" }, status: "ok", requested_by: "System · from the registrar email" },
];

// ---- readers ----
export async function getDayBlocks(date = d(0)): Promise<DayBlock[]> {
  if (!hasSupabaseEnv()) return sampleBlocks;
  const sb = await createClient();
  const { data } = await sb.from("day_blocks").select("*").eq("date", date).order("start_time");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), title: String(r.title), place: (r.place as string) ?? null,
    person: String(r.person_name ?? ""), kind: r.kind as BlockKind, confidence: (r.confidence as number) ?? null, travel_min: (r.travel_min as number) ?? null,
    weather: (r.weather as Weather) ?? null, checklist: null, source: { name: String(r.source_name ?? "Calendar"), href: String(r.source_href ?? "#") }, requested_by: String(r.requested_by ?? "System"),
  }));
}

export async function getDayQuestions(): Promise<DayQuestion[]> {
  if (!hasSupabaseEnv()) return sampleQuestions;
  const sb = await createClient();
  const { data } = await sb.from("location_stops").select("id, started_at, ended_at, address, suggestions").eq("status", "question").order("started_at", { ascending: false }).limit(10);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), window: `${new Date(String(r.started_at)).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}–${new Date(String(r.ended_at)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
    place_label: String(r.address ?? "unknown place"), suggestions: ((r.suggestions as string[]) ?? []).concat(["Personal", "Skip"]), days_waiting: Math.floor((Date.now() - new Date(String(r.started_at)).getTime()) / 86_400_000), for_person: "you",
  }));
}

export async function getDayRecord(date = d(-1)): Promise<DayRecordEntry[]> {
  if (!hasSupabaseEnv()) return sampleRecord;
  const sb = await createClient();
  const { data } = await sb.from("day_blocks").select("*").eq("date", date).order("start_time");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), title: String(r.title), place: (r.place as string) ?? null,
    how: r.kind === "calendar" ? "calendar" : r.kind === "inferred" ? "inferred" : r.kind === "private" ? "private" : "answered",
  }));
}

export async function getSyncStatus(keys?: SyncStatus["key"][]): Promise<SyncStatus[]> {
  const all = hasSupabaseEnv() ? await readSyncFromStatus() : sampleSync;
  return keys ? all.filter((s) => keys.includes(s.key)) : all;
}
async function readSyncFromStatus(): Promise<SyncStatus[]> {
  const sb = await createClient();
  const { data } = await sb.from("system_status").select("*").in("key", ["sync_calendar", "sync_location", "sync_weather", "sync_messages", "sync_orders"]);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const key = String(r.key).replace("sync_", "") as SyncStatus["key"];
    return { key, label: sampleSync.find((s) => s.key === key)?.label ?? key, state: r.state === "ok" ? "ok" : r.state === "error" ? "error" : "warn", last_sync: String(r.updated_at), note: (r.summary as string) ?? undefined };
  });
}

export async function getCalendarEvents(fromDate = d(0), days = 14): Promise<CalendarEvent[]> {
  if (!hasSupabaseEnv()) return sampleEvents.filter((e) => e.date >= fromDate && e.date <= d(days));
  const sb = await createClient();
  const { data } = await sb.from("calendar_events").select("*").gte("date", fromDate).lte("date", d(days)).order("date").order("start_time");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), date: String(r.date), start: r.start_time ? String(r.start_time).slice(0, 5) : null, end: r.end_time ? String(r.end_time).slice(0, 5) : null,
    title: String(r.title), place: (r.place as string) ?? null, person: String(r.person_name ?? "Family"), weather: (r.weather as Weather) ?? null, trip: Boolean(r.is_trip),
    from_message: (r.from_message as string) ?? undefined, source: { name: String(r.calendar_name ?? "Calendar"), href: String(r.source_href ?? "#") }, requested_by: String(r.requested_by ?? "System"),
  }));
}

export async function getRecurring(): Promise<RecurringItem[]> {
  // The register itself is Money's (F7.5). Until that slice exposes a table, this reads the same rows from
  // calendar_events tagged kind='recurring' and falls back to samples.
  if (!hasSupabaseEnv()) return sampleRecurring;
  const sb = await createClient();
  const { data } = await sb.from("calendar_events").select("*").eq("kind", "recurring").order("date");
  if (!data?.length) return sampleRecurring;
  return (data as Array<Record<string, unknown>>).map((r) => {
    const due = String(r.date); const days = Math.round((new Date(due).getTime() - Date.now()) / 86_400_000);
    return { id: String(r.id), name: String(r.title), kind: "event", next_due: due, cycle: String(r.cycle ?? ""), who: String(r.person_name ?? ""), entity: null, amount_note: null, reminders: [], source: { name: String(r.calendar_name ?? "Calendar"), href: "#" }, status: days < 0 ? "overdue" : days <= 10 ? "soon" : "ok", requested_by: String(r.requested_by ?? "System") } as RecurringItem;
  });
}

// ---- derived helpers ----
export function daySummary(blocks: DayBlock[]) {
  const temps = blocks.map((b) => b.weather?.temp ?? NaN).filter((n) => !Number.isNaN(n));
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const rain = blocks.find((b) => (b.weather?.precip ?? 0) >= 50);
  const bring = blocks.flatMap((b) => b.checklist?.items.filter((i) => i.weather && !i.packed).map((i) => `${i.label.toLowerCase()} for ${b.person}`) ?? []);
  const line = `${lo <= 40 ? "Cold start" : "Mild start"}, ${lo}°, ${hi > lo ? `warming to ${hi}` : "steady"}.${rain ? ` Rain from ${fmtTime(rain.start)} during ${rain.title.toLowerCase()}.` : ""}`;
  return { line, bring: Array.from(new Set(bring)) };
}
