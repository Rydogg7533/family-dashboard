// Places the household has been to but has not named yet, worked out from the GPS stops. Pure helpers (client-safe, no I/O).
// Stops within CLUSTER_M of each other are one place. A name is only ever SUGGESTED, with its reason; a person taps to accept. Home is never assumed.
export const CLUSTER_M = 100;
export const MIN_STOP_MIN = 8;
const HOME_MIN_NIGHTS = 3;      // a two-night hotel stay is not home
const SAME_NAME_FAR_M = 300;
const CONTACT_MATCH_M = 50;     // a stop this close to a contact's address is at that contact's address    // a second place with an existing place's name, this far away, gets its city added
const TZ = "America/Denver";

export type Stop = { id: string; started_at: string; ended_at: string; lat: number; lon: number; address: string | null };
export type Receipt = { merchant: string | null; date: string };
export type Event = { date: string; start_time: string | null; end_time: string | null; title: string | null; place: string | null };
// The few GEvent fields the place rules need (src/lib/google-calendar.ts is server-only, so this stays a plain structural type).
export type CalEvent = { title: string; location: string | null; allDay: boolean; date: string; endDate: string; start: string | null; end: string | null; attendees: { email: string; status: string | null }[] };
export type Named = { name: string; lat: number | null; lon: number | null };
// A contact's address as coordinates. validUntil set = an older address of that contact (kept so old visits still match).
export type ContactSpot = { cardId: string; name: string; lastName: string | null; org: string | null; label: string | null; lat: number; lon: number; address: string; validUntil: string | null };
export type Suggestion = { name: string; reason: string };
export type VisitPoint = { lat: number; lon: number; startedAt: string; endedAt: string; mins: number };
export type Candidate = { key: string; points: VisitPoint[]; ids: string[]; lat: number; lon: number; address: string | null; visits: number; minutes: number; lastAt: string; when: string; suggestion: Suggestion | null };

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

const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
// The local dates on which this stop covers 3 am, i.e. the nights spent here.
function nightsOf(s: Stop): string[] {
  const out = new Set<string>(), end = new Date(s.ended_at).getTime();
  for (let t = new Date(s.started_at).getTime(); t <= end; t += 30 * 60000) { const p = localParts(new Date(t).toISOString()); if (p.hour === 3) out.add(p.date); }
  return Array.from(out);
}

// ---------- names ----------
// Words that never decide a match on their own.
const GENERIC = new Set(["store", "stores", "shop", "service", "services", "company", "the", "inc", "llc", "corp", "market", "center", "centre", "group", "express", "restaurant", "cafe", "grill", "bar", "station", "supply", "outlet", "mart", "super", "supercenter", "neighborhood", "wholesale", "fresh"]);
const LODGING = /\b(hotel|inn|suites|resort|motel|lodge|hostel|airbnb|vacation rental)\b/i;

// "Panda Express #0539" and "The Home Depot, Inc." reduce to a comparable form; "Wal-Mart" and "Walmart" meet in the compact form.
export function normName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[’']/g, "").replace(/#\s*\d+/g, " ").replace(/\b(inc|llc|ltd|co|corp|corporation|company)\b\.?/g, " ").replace(/\bthe\b/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
const compact = (s: string) => s.replace(/\s+/g, "");
const distinctive = (s: string) => normName(s).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w));

// Do a receipt's merchant and the map's name for a spot refer to the same business? Loose on form, strict on the distinctive word.
export function sameBusiness(merchant: string | null | undefined, mapNameText: string | null | undefined): boolean {
  const a = normName(merchant), b = normName(mapNameText);
  if (!a || !b) return false;
  const ca = compact(a), cb = compact(b);
  if (ca === cb) return true;                                                          // exact once punctuation and spacing are ignored (short names too)
  if (ca.length >= 5 && cb.length >= 5 && (ca.includes(cb) || cb.includes(ca))) return true;   // "Home Depot" within "Home Depot Orem"
  const da = distinctive(merchant ?? ""), db = distinctive(mapNameText ?? "");
  return da.length > 0 && db.length > 0 && da[0] === db[0];                            // the same lead word ("Taco Bell" is not "Bell Tower Park")
}

// The business or landmark name at the front of a stored address ("Peet's Coffee, 123 Main St, Orem"), or null when the address starts with a house number or is only a street.
const STREET_WORDS = /\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|way|highway|hwy|court|ct|parkway|pkwy|circle|cir|place|pl|freeway|interstate)\.?$/i;
export function mapName(address: string | null | undefined): string | null {
  const first = (address ?? "").split(",")[0].trim();
  if (!first || /^\d/.test(first) || STREET_WORDS.test(first) || first.length > 60) return null;
  return first;
}
// A short place qualifier from a stored address ("Peet's Coffee, 800 N State St, Orem" gives "Orem"), else the street.
export function cityOf(address: string | null | undefined): string | null {
  const parts = (address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3 && parts[parts.length - 1].length <= 30 && !/\d/.test(parts[parts.length - 1])) return parts[parts.length - 1];
  const street = parts.find((p) => /^\d/.test(p));
  return street ? street.slice(0, 30) : null;
}


// Contacts whose address (current, or older and closed before the visit) is within CONTACT_MATCH_M of this place. One contact names it; several
// sharing a last name make a family home; anything else is ambiguous and suggests nothing.
export function contactSuggestion(stops: Stop[], contacts: ContactSpot[], lat: number, lon: number): Suggestion | null {
  const hits = contacts.filter((c) => distM(c.lat, c.lon, lat, lon) <= CONTACT_MATCH_M && (!c.validUntil || stops.some((s) => s.ended_at <= c.validUntil!)));
  const cards = Array.from(new Map(hits.map((h) => [h.cardId, h])).values());
  if (!cards.length) return null;
  const old = (c: ContactSpot) => (c.validUntil ? " (an older address on their card)" : "");
  if (cards.length === 1) {
    const c = cards[0], work = /work|office|business/i.test(c.label ?? "") && c.org;
    const name = work ? (c.org as string) : /home|house/i.test(c.label ?? "") || !c.label ? `${c.name}'s home` : `${c.name}'s place`;
    return { name, reason: `This is the address on ${c.name}'s contact card (${c.address})${old(c)}` };
  }
  const last = cards[0].lastName;
  if (last && cards.every((c) => c.lastName === last)) return { name: `${last} family home`, reason: `${cards.map((c) => c.name).join(", ")} all have this address (${cards[0].address})` };
  return null;
}

// Google events to the shape suggestName reads. Only timed, single-day events that could name a place: an event you declined, an online meeting
// or a bare "Call"/"Focus time" with no location says nothing about where you were. A location that is just a street address is skipped as a name
// (the title is used instead).
const ONLINE = /(https?:\/\/|zoom|meet\.google|teams\.microsoft|webex|phone|call me|online|virtual)/i;
const NOISE_TITLE = /^(call|calls|zoom|meeting|focus( time)?|busy|block|hold|reminder|birthday|travel|flight|out of office|ooo|lunch|dinner|breakfast)\b/i;
export function eventsForPlaces(list: CalEvent[], selfEmail?: string): Event[] {
  const me = (selfEmail ?? "").toLowerCase();
  const out: Event[] = [];
  for (const e of list) {
    if (e.allDay || !e.start || !e.end || e.date !== e.endDate) continue;
    if (me && e.attendees.some((a) => a.email.toLowerCase() === me && a.status === "declined")) continue;
    const loc = (e.location ?? "").trim(), title = (e.title ?? "").trim();
    if (ONLINE.test(loc) || ONLINE.test(title)) continue;
    const venue = loc && !/^\d/.test(loc) ? loc.split(",")[0].trim() : "";
    if (!venue && (!title || NOISE_TITLE.test(title))) continue;
    out.push({ date: e.date, start_time: e.start, end_time: e.end, title: title || null, place: venue || null });
  }
  return out;
}

// A name for a place, only when the evidence points to exactly one. Never fills anything in by itself.
// Order: calendar, then the map's name (a receipt that agrees is mentioned, never needed or used alone), then Home.
export function suggestName(stops: Stop[], receipts: Receipt[], events: Event[], opts: { named?: Named[]; hasHome?: boolean; lat?: number; lon?: number; contacts?: ContactSpot[] } = {}): Suggestion | null {
  const visitDays = Array.from(new Set(stops.map((s) => localParts(s.started_at).date)));
  const names = new Map<string, { name: string; n: number }>();
  for (const s of stops) { const m = mapName(s.address); if (m) { const k = normName(m); names.set(k, { name: m, n: (names.get(k)?.n ?? 0) + 1 }); } }
  const top = Array.from(names.values()).sort((a, b) => b.n - a.n)[0];
  // 1. A calendar event that overlaps the visit names the place (its location, else its title) when every visit with an event agrees.
  const named = new Map<string, { name: string; date: string }>();
  for (const s of stops) {
    const a = localParts(s.started_at), b = localParts(s.ended_at);
    const ev = events.find((e) => e.date === a.date && e.start_time && e.end_time && e.start_time.slice(0, 5) <= b.time && e.end_time.slice(0, 5) >= a.time && (e.place || e.title));
    if (ev) { const nm = (ev.place || ev.title) as string; named.set(normName(nm), { name: nm, date: ev.date }); }
  }
  // A calendar name is dropped when the map names a business at this spot that is not the event: the plan and what happened differ, which is for the day comparison to show, not for a place name.
  const v1 = named.size === 1 ? Array.from(named.values())[0] : null;
  if (v1 && !(top && !sameBusiness(v1.name, top.name))) { const v = v1; return { name: v.name, reason: `Your calendar has "${v.name}" at this time on ${nice(v.date)}` }; }
  // 2. Home (ahead of contacts, so your own address on a family contact card never makes it someone else home): only when no place is called Home yet, you stayed overnight here on three or more nights, and the spot is not a hotel, inn or rental.
  const lodging = stops.some((s) => LODGING.test(s.address ?? ""));
  if (!opts.hasHome && !lodging && new Set(stops.flatMap(nightsOf)).size >= HOME_MIN_NIGHTS) return { name: "Home", reason: "You stay here overnight" };
  // 3. A contact's address at this spot: more specific than the map's nearest-feature guess, so it ranks first of the two.
  if (opts.contacts?.length && opts.lat != null && opts.lon != null) { const c = contactSuggestion(stops, opts.contacts, opts.lat, opts.lon); if (c) return c; }
  // 4. The map's name for the spot (already in the stored address), the one most of the visits agree on. A receipt dated on a visit day that matches it is added to the reason.
  if (top) {
    const rc = receipts.find((r) => r.merchant && visitDays.includes(r.date) && sameBusiness(r.merchant, top.name));
    let name = top.name;
    // Another named place already has this name somewhere else: add the city so the two stay separate places.
    const clash = (opts.named ?? []).some((p) => normName(p.name) === normName(name) && (p.lat == null || p.lon == null || opts.lat == null || opts.lon == null || distM(p.lat, p.lon, opts.lat, opts.lon) > SAME_NAME_FAR_M));
    if (clash) { const c = cityOf(stops.find((s) => mapName(s.address) === top.name)?.address); if (c) name = `${name} (${c})`; }
    const base = `OpenStreetMap lists "${top.name}" at this spot. A business next door could be the real stop.`;
    return { name, reason: rc ? `A ${rc.merchant} receipt is dated ${nice(rc.date)}, a day you were here, and the map lists this spot under a matching name.` : base };
  }
  return null;
}

export function buildCandidates(stops: Stop[], receipts: Receipt[], events: Event[], named: Named[] = [], contacts: ContactSpot[] = []): Candidate[] {
  const hasHome = named.some((p) => normName(p.name) === "home");
  return groupStops(stops).map((g) => {
    const addr = new Map<string, number>();
    for (const s of g.stops) if (s.address) addr.set(s.address, (addr.get(s.address) ?? 0) + 1);
    const address = Array.from(addr.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const last = g.stops.map((s) => s.ended_at).sort().pop() as string;
    return { key: g.stops[0].id, points: g.stops.map((x) => ({ lat: x.lat, lon: x.lon, startedAt: x.started_at, endedAt: x.ended_at, mins: Math.round(mins(x.started_at, x.ended_at)) })), ids: g.stops.map((s) => s.id), lat: g.lat, lon: g.lon, address, visits: g.stops.length, minutes: Math.round(g.stops.reduce((t, s) => t + mins(s.started_at, s.ended_at), 0)), lastAt: last, when: whenText(g.stops), suggestion: suggestName(g.stops, receipts, events, { named, hasHome, lat: g.lat, lon: g.lon, contacts }) };
  }).sort((a, b) => b.visits - a.visits || b.minutes - a.minutes);
}

export function checkPlaceName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!s) return { ok: false, error: "Type a name first." };
  if (s.length > 60) return { ok: false, error: "Keep the name under 60 characters." };
  return { ok: true, value: s };
}
