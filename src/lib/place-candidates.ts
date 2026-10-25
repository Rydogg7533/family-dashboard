// Places the household has been to but has not named yet, worked out from the GPS stops. Pure helpers (client-safe, no I/O).
// Stops within CLUSTER_M of each other are one place. A name is only ever SUGGESTED, with its reason; a person taps to accept. Home is never assumed.
export const CLUSTER_M = 100;
export const MIN_STOP_MIN = 8;
const TZ = "America/Denver";

export type Stop = { id: string; started_at: string; ended_at: string; lat: number; lon: number; address: string | null };
export type Receipt = { merchant: string | null; date: string };
export type Event = { date: string; start_time: string | null; end_time: string | null; title: string | null; place: string | null };
export type Suggestion = { name: string; reason: string };
export type Candidate = { key: string; ids: string[]; lat: number; lon: number; address: string | null; visits: number; minutes: number; lastAt: string; when: string; suggestion: Suggestion | null };

export function distM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLon = r(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const mins = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

export function localParts(iso: string): { date: string; time: string; hour: number; dow: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, hour: Number(hour), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

type Group = { stops: Stop[]; lat: number; lon: number };

// Stops shorter than MIN_STOP_MIN are pauses in travel and never become places.
export function groupStops(stops: Stop[]): Group[] {
  const groups: Group[] = [];
  const real = stops.filter((s) => mins(s.started_at, s.ended_at) >= MIN_STOP_MIN).sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const s of real) {
    let best: Group | null = null, bestD = Infinity;
    for (const g of groups) { const d = distM(s.lat, s.lon, g.lat, g.lon); if (d <= CLUSTER_M && d < bestD) { best = g; bestD = d; } }
    if (!best) { groups.push({ stops: [s], lat: s.lat, lon: s.lon }); continue; }
    best.stops.push(s);
    const n = best.stops.length;
    best.lat += (s.lat - best.lat) / n; best.lon += (s.lon - best.lon) / n;
  }
  return groups;
}

function whenText(stops: Stop[]): string {
  if (stops.length < 2) return "";
  const lp = stops.map((s) => localParts(s.started_at));
  const wk = lp.every((p) => p.dow >= 1 && p.dow <= 5) ? "weekday " : lp.every((p) => p.dow === 0 || p.dow === 6) ? "weekend " : "";
  const hs = lp.map((p) => p.hour).sort((a, b) => a - b), h = hs[Math.floor(hs.length / 2)];
  const part = h < 11 ? "mornings" : h < 17 ? "afternoons" : h < 22 ? "evenings" : "nights";
  return `usually ${wk}${part}`;
}

const GENERIC = new Set(["store", "shop", "service", "services", "company", "the", "inc", "llc", "corp", "market", "center", "centre", "group", "express"]);
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const isOvernight = (s: Stop) => { const a = localParts(s.started_at), b = localParts(s.ended_at); return a.hour <= 2 && b.hour >= 5 && mins(s.started_at, s.ended_at) >= 180; };

// A name for a place, only when the evidence points to exactly one. Never fills anything in by itself.
export function suggestName(stops: Stop[], receipts: Receipt[], events: Event[], spots: Map<string, number> = new Map()): Suggestion | null {
  const visitDays = Array.from(new Set(stops.map((s) => localParts(s.started_at).date)));
  // 1. A calendar event that overlaps the visit names the place (its location, else its title) when every visit with an event agrees.
  const named = new Map<string, { name: string; date: string }>();
  for (const s of stops) {
    const a = localParts(s.started_at), b = localParts(s.ended_at);
    const ev = events.find((e) => e.date === a.date && e.start_time && e.end_time && e.start_time.slice(0, 5) <= b.time && e.end_time.slice(0, 5) >= a.time && (e.place || e.title));
    if (ev) { const nm = (ev.place || ev.title) as string; named.set(norm(nm), { name: nm, date: ev.date }); }
  }
  if (named.size === 1) { const v = Array.from(named.values())[0]; return { name: v.name, reason: `Your calendar has "${v.name}" at this time on ${nice(v.date)}` }; }
  // 2. A receipt dated on a visit day. A receipt carries a date, not a time, so it can name a place only when (a) the map's name for the spot shares
  //    a word with the merchant (both agree), or (b) you were at no more than two spots that day and only one merchant has a receipt.
  //    Without that, a receipt would name every place visited that day (a day at 14 spots would offer the same name 14 times).
  const dayReceipts = receipts.filter((r) => r.merchant && visitDays.includes(r.date));
  const mapNames = stops.map((s) => mapName(s.address)).filter((x): x is string => !!x);
  const words = (t: string) => norm(t).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w));
  const strong = dayReceipts.filter((r) => mapNames.some((m) => words(m).some((w) => words(r.merchant as string).includes(w))));
  const strongNames = new Map<string, { name: string; date: string }>();
  for (const r of strong) strongNames.set(norm(r.merchant), { name: r.merchant as string, date: r.date });
  if (strongNames.size === 1) { const v = Array.from(strongNames.values())[0]; return { name: v.name, reason: `A ${v.name} receipt is dated ${nice(v.date)}, and the map lists this spot under a matching name` }; }
  const byMerchant = new Map<string, { name: string; date: string }>();
  for (const r of dayReceipts) byMerchant.set(norm(r.merchant), { name: r.merchant as string, date: r.date });
  if (byMerchant.size === 1 && visitDays.every((d) => (spots.get(d) ?? 1) <= 2)) { const v = Array.from(byMerchant.values())[0]; return { name: v.name, reason: `A ${v.name} receipt is dated ${nice(v.date)}, and you were at ${(spots.get(localParts(stops[0].started_at).date) ?? 1) === 1 ? "only this spot" : "two spots"} that day` }; }
  // 3. Home is only offered, with its reason, when you stay overnight here more than once.
  if (stops.filter(isOvernight).length >= 2) return { name: "Home", reason: "You stay here overnight" };
  // 4. Lowest priority: the business or landmark OpenStreetMap lists at this spot (already in the stored address). A neighbour could be the real stop, so the reason says so.
  const names = new Map<string, { name: string; n: number }>();
  for (const s of stops) { const m = mapName(s.address); if (m) { const k = norm(m); names.set(k, { name: m, n: (names.get(k)?.n ?? 0) + 1 }); } }
  const top = Array.from(names.values()).sort((a, b) => b.n - a.n)[0];
  if (top) return { name: top.name, reason: `OpenStreetMap lists "${top.name}" at this spot. A business next door could be the real stop.` };
  return null;
}

// The business or landmark name at the front of a stored address ("Peet's Coffee, 123 Main St, Orem"), or null when the address starts with a house number or is only a street.
const STREET_WORDS = /\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|way|highway|hwy|court|ct|parkway|pkwy|circle|cir|place|pl|freeway|interstate)\.?$/i;
export function mapName(address: string | null | undefined): string | null {
  const first = (address ?? "").split(",")[0].trim();
  if (!first || /^\d/.test(first) || STREET_WORDS.test(first) || first.length > 60) return null;
  return first;
}

export function buildCandidates(stops: Stop[], receipts: Receipt[], events: Event[]): Candidate[] {
  const groups = groupStops(stops);
  // How many different spots you were at on each day (a receipt can name one of them, not all).
  const spots = new Map<string, number>();
  for (const g of groups) for (const d of new Set(g.stops.map((s) => localParts(s.started_at).date))) spots.set(d, (spots.get(d) ?? 0) + 1);
  return groups.map((g) => {
    const addr = new Map<string, number>();
    for (const s of g.stops) if (s.address) addr.set(s.address, (addr.get(s.address) ?? 0) + 1);
    const address = Array.from(addr.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const last = g.stops.map((s) => s.ended_at).sort().pop() as string;
    return { key: g.stops[0].id, ids: g.stops.map((s) => s.id), lat: g.lat, lon: g.lon, address, visits: g.stops.length, minutes: Math.round(g.stops.reduce((t, s) => t + mins(s.started_at, s.ended_at), 0)), lastAt: last, when: whenText(g.stops), suggestion: suggestName(g.stops, receipts, events, spots) };
  }).sort((a, b) => b.visits - a.visits || b.minutes - a.minutes);
}

export function checkPlaceName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!s) return { ok: false, error: "Type a name first." };
  if (s.length > 60) return { ok: false, error: "Keep the name under 60 characters." };
  return { ok: true, value: s };
}
