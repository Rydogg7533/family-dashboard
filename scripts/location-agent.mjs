#!/usr/bin/env node
// Mac mini → location agent (F3). Runs every 10 minutes via launchd. No model, no dependencies: Node 20+ and fetch.
//
// raw points (locations) → stops (location_stops) → Places (places) → day record (day_blocks) → Questions for you.
//
// 1. For each person with new raw points: cluster consecutive points within STOP_RADIUS_M for ≥ STOP_MIN_MINUTES
//    into stops. The last cluster stays 'open' and is extended on the next run. Consumed points are marked 'stop'.
// 2. Home is never guessed: the first overnight stop is a question with "Home" as its first suggestion.
// 3. Each closed stop: match a Place within max(place.radius_m, MATCH_RADIUS_M). A calendar event overlapping the
//    stop names a new Place. Known + confirmed Place → day_blocks.kind='inferred' with a confidence. Otherwise →
//    reverse-geocode (Nominatim) and ask: status='question' with 2–3 suggestions, day_blocks.kind='unknown'.
// 4. Answers: stops the person answered on the Day page (status='answered') become a named Place (confirmed) and a
//    real block; the same Place is never asked about again.
// 5. Retention: delete raw/stop points older than RETENTION_DAYS. Stops, Places and blocks stay.
// 6. system_status.sync_location gets a one-line summary.
//
// Secrets: ~/_secrets_local_only/family-dashboard.env with SUPABASE_URL and SUPABASE_SERVICE_KEY (mini-report.sh names).
// No coordinates ever go to a model; the only outside call is Nominatim for an address, and only for questions.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STOP_RADIUS_M = 75;        // points within this distance of the running centre belong to the same stop
const STOP_MIN_MINUTES = 8;      // a cluster shorter than this is just a pause in travel
const MATCH_RADIUS_M = 150;      // a stop this close to a known Place is that Place
const RETENTION_DAYS = 30;
const TZ = process.env.STEWARD_TZ || "America/Denver";
const MAX_POINTS_PER_RUN = 20000;
const NOMINATIM_UA = "StewardOS location-agent (household self-hosted; contact via dashboard)";

// ---------- env ----------
const envPath = join(homedir(), "_secrets_local_only", "family-dashboard.env");
let env = {};
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* reported in main() */ }
// The mini's env file uses SUPABASE_URL / SUPABASE_SERVICE_KEY (same as mini-report.sh); the app's names also work.
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;


// ---------- PostgREST helpers ----------
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (path) => rest("GET", path);
const insert = (table, rows) => rest("POST", table, rows, { Prefer: "return=representation" });
const patch = (path, body) => rest("PATCH", path, body, { Prefer: "return=representation" });
const del = (path) => rest("DELETE", path, undefined, { Prefer: "return=minimal" });

// ---------- geometry and time ----------
function distM(aLat, aLon, bLat, bLon) {
  const R = 6371000, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLon = toR(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const minutes = (a, b) => (new Date(b) - new Date(a)) / 60000;
function localParts(iso) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, hour: Number(hour), dow };
}
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// ---------- clustering ----------
// Walks points in time order. A cluster is a running centroid; a point farther than STOP_RADIUS_M starts a new one.
// Returns closed clusters (duration ≥ STOP_MIN_MINUTES) and the trailing open cluster (may be short).
function cluster(points, seed) {
  const closed = [];
  let cur = seed ? { ...seed } : null;
  const push = (c) => { if (c && minutes(c.started_at, c.ended_at) >= STOP_MIN_MINUTES) closed.push(c); };
  for (const p of points) {
    if (!cur) { cur = { started_at: p.recorded_at, ended_at: p.recorded_at, lat: p.lat, lon: p.lon, points: 1 }; continue; }
    if (distM(cur.lat, cur.lon, p.lat, p.lon) <= STOP_RADIUS_M) {
      const n = cur.points + 1;
      cur.lat += (p.lat - cur.lat) / n; cur.lon += (p.lon - cur.lon) / n; cur.points = n; cur.ended_at = p.recorded_at;
    } else {
      push(cur);
      cur = { started_at: p.recorded_at, ended_at: p.recorded_at, lat: p.lat, lon: p.lon, points: 1 };
    }
  }
  return { closed, open: cur };
}

// ---------- outside lookups ----------
async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`, { headers: { "User-Agent": NOMINATIM_UA } });
    if (!r.ok) return null;
    const j = await r.json();
    const a = j.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const name = j.name && j.name !== street ? j.name : null;
    return [name, street, a.city || a.town || a.village].filter(Boolean).join(", ") || j.display_name || null;
  } catch { return null; }
}

// ---------- per-person run ----------
async function processPerson(person, places, calendar, log) {
  const name = person.display_name;
  // PostgREST returns at most 1000 rows per request, so page with Range headers until the run cap or the end.
  const raw = [];
  for (let from = 0; from < MAX_POINTS_PER_RUN; from += 1000) {
    const page = await rest("GET", `locations?person=eq.${person.id}&status=eq.raw&order=recorded_at.asc&select=id,recorded_at,lat,lon,accuracy_m`, undefined, { Range: `${from}-${from + 999}` });
    raw.push(...page);
    if (page.length < 1000) break;
  }
  const usable = raw.filter((p) => p.accuracy_m == null || p.accuracy_m <= 100);
  const [openStop] = await get(`location_stops?person=eq.${person.id}&status=eq.open&order=started_at.desc&limit=1`);
  if (!raw.length && !openStop) return;

  const { closed, open } = cluster(usable, openStop ? { id: openStop.id, started_at: openStop.started_at, ended_at: openStop.ended_at, lat: openStop.lat, lon: openStop.lon, points: openStop.points } : null);

  // Mark points consumed before writing stops, so a crash never double-counts.
  for (let i = 0; i < raw.length; i += 500) await patch(`locations?id=in.(${raw.slice(i, i + 500).map((p) => p.id).join(",")})`, { status: "stop" });

  // Persist: closed clusters become rows (the former open row, if it closed, is updated in place).
  const stops = [];
  for (const c of closed) {
    if (c.id) stops.push((await patch(`location_stops?id=eq.${c.id}`, { ended_at: c.ended_at, lat: c.lat, lon: c.lon, points: c.points, status: "question", updated_at: new Date().toISOString() }))[0]);
    else stops.push((await insert("location_stops", [{ person: person.id, started_at: c.started_at, ended_at: c.ended_at, lat: c.lat, lon: c.lon, points: c.points, status: "question" }]))[0]);
  }
  if (open) {
    if (open.id) await patch(`location_stops?id=eq.${open.id}`, { ended_at: open.ended_at, lat: open.lat, lon: open.lon, points: open.points, updated_at: new Date().toISOString() });
    else await insert("location_stops", [{ person: person.id, started_at: open.started_at, ended_at: open.ended_at, lat: open.lat, lon: open.lon, points: open.points, status: "open" }]);
  } else if (openStop && closed.every((c) => c.id !== openStop.id)) {
    // The open stop was too short to keep and the person moved on.
    await patch(`location_stops?id=eq.${openStop.id}`, { status: "skipped" });
  }

  // Home is never guessed (an overnight stop could be a hotel): an overnight stop with no Home yet is asked about
  // with "Home" as the first suggestion, so it is one tap and never wrong.
  let mine = places.filter((p) => p.person === person.id);
  const hasHome = () => mine.some((p) => p.name.toLowerCase() === "home");
  const isOvernight = (s) => localParts(s.started_at).hour <= 2 && localParts(s.ended_at).hour >= 5 && minutes(s.started_at, s.ended_at) >= 180;

  let filled = 0, asked = 0;
  let prevEnd = null;
  for (const s of stops) {
    const dur = Math.round(minutes(s.started_at, s.ended_at));
    const lp = localParts(s.started_at), le = localParts(s.ended_at);
    const travel = prevEnd ? Math.round(minutes(prevEnd, s.started_at)) : null;
    prevEnd = s.ended_at;

    // 3a. known Place?
    let best = null, bestD = Infinity;
    for (const p of mine) {
      if (p.lat == null) continue;
      const d = distM(s.lat, s.lon, p.lat, p.lon);
      if (d <= Math.max(p.radius_m || 0, MATCH_RADIUS_M) && d < bestD) { best = p; bestD = d; }
    }

    // 3b. calendar event overlapping this stop (person's own or shared) names a Place when none matched.
    const ev = calendar.find((e) => (e.person === person.id || e.person == null) && e.date === lp.date && e.start_time && e.end_time && e.start_time.slice(0, 5) <= le.time && e.end_time.slice(0, 5) >= lp.time);
    if (!best && ev) {
      const pname = ev.place || ev.title;
      const [p] = await insert("places", [{ person: person.id, name: pname, meaning: ev.title, usual_activity: ev.title, lat: s.lat, lon: s.lon, radius_m: 100, confirmed: false, added_by: "calendar", visits: 0 }]);
      mine.push(p); places.push(p); best = p;
    }

    const block = { person: person.id, person_name: name, date: lp.date, start_time: lp.time, end_time: le.date === lp.date ? le.time : "23:59", travel_min: travel != null && travel < 180 ? travel : null, source_name: "Places", source_href: "/places", requested_by: "System · from Overland" };

    if (best && (best.confirmed || ev)) {
      // Fill. Confidence rises with visits; a calendar match is strong on its own.
      const conf = ev ? 0.85 : Math.min(0.95, 0.6 + 0.08 * Math.min(best.visits || 0, 4));
      const [b] = await insert("day_blocks", [{ ...block, title: ev ? ev.title : (best.usual_activity || best.name), place: best.name, place_id: best.id, kind: "inferred", confidence: conf }]);
      await patch(`location_stops?id=eq.${s.id}`, { status: "filled", place_id: best.id, confidence: conf, day_block_id: b.id, updated_at: new Date().toISOString() });
      await learnVisit(best, s, dur, lp);
      filled++;
    } else {
      // Ask once. Address from Nominatim; suggestions = unconfirmed match (if any) + nearest two Places by name.
      const address = (await reverseGeocode(s.lat, s.lon)) || `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`;
      const nearest = mine.filter((p) => p.lat != null && p.id !== best?.id).map((p) => ({ p, d: distM(s.lat, s.lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d).slice(0, 2).map((x) => x.p.name);
      const suggestions = [...(!hasHome() && isOvernight(s) ? ["Home"] : []), ...(best ? [best.name] : []), ...nearest, "New place"].slice(0, 3);
      const [b] = await insert("day_blocks", [{ ...block, title: "Unknown stop", place: address, place_id: best?.id ?? null, kind: "unknown", confidence: best ? 0.5 : 0.3 }]);
      await patch(`location_stops?id=eq.${s.id}`, { status: "question", address, suggestions, place_id: best?.id ?? null, confidence: best ? 0.5 : 0.3, day_block_id: b.id, updated_at: new Date().toISOString() });
      asked++;
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim: one request per second
    }
  }
  if (stops.length) log.push(`${name}: ${stops.length} stops, ${filled} filled, ${asked} questions`);
}

// Update a Place's usual pattern from one more visit.
async function learnVisit(place, stop, durMin, lp) {
  const visits = (place.visits || 0) + 1;
  const days = Array.from(new Set([...(place.usual_days || []), lp.dow])).sort();
  // Running medians would need history; keep an exponential blend, which is good enough for "usual".
  const prevMin = place.usual_minutes ?? durMin;
  const usual_minutes = Math.round(prevMin * 0.7 + durMin * 0.3);
  const usual_start = place.usual_start ? place.usual_start : `${lp.time}:00`;
  const upd = { visits, usual_days: days, usual_minutes, usual_start, last_visit_at: stop.started_at, updated_at: new Date().toISOString(), updated_by: "location-agent" };
  await patch(`places?id=eq.${place.id}`, upd);
  Object.assign(place, upd);
}

// 4. Answers from the Day page: turn them into Places and real blocks.
async function applyAnswers(places, log) {
  const answered = await get(`location_stops?status=eq.answered&applied_at=is.null&select=*`);
  for (const s of answered) {
    const answer = (s.answer || "").trim();
    const now = new Date().toISOString();
    if (!answer || /^(skip)$/i.test(answer)) { await patch(`location_stops?id=eq.${s.id}`, { status: "skipped", applied_at: now }); continue; }
    if (/^(personal|private|this was private)$/i.test(answer)) {
      if (s.day_block_id) await patch(`day_blocks?id=eq.${s.day_block_id}`, { title: "Private", place: null, kind: "private", confidence: null, answered_with: answer });
      await patch(`location_stops?id=eq.${s.id}`, { status: "private", applied_at: now }); continue;
    }
    let place = places.find((p) => p.person === s.person && p.name.toLowerCase() === answer.toLowerCase());
    if (!place && s.place_id) place = places.find((p) => p.id === s.place_id);
    if (place && place.name.toLowerCase() !== answer.toLowerCase()) {
      await patch(`places?id=eq.${place.id}`, { name: answer, confirmed: true, updated_by: "answer" }); place.name = answer; place.confirmed = true;
    } else if (place) {
      await patch(`places?id=eq.${place.id}`, { confirmed: true, updated_by: "answer" }); place.confirmed = true;
    } else {
      [place] = await insert("places", [{ person: s.person, name: answer, meaning: answer, usual_activity: answer, lat: s.lat, lon: s.lon, radius_m: 100, confirmed: true, added_by: "answer", visits: 0 }]);
      places.push(place);
    }
    if (s.day_block_id) await patch(`day_blocks?id=eq.${s.day_block_id}`, { title: place.usual_activity || place.name, place: place.name, place_id: place.id, kind: "inferred", confidence: 1, answered_with: answer });
    await learnVisit(place, s, Math.round(minutes(s.started_at, s.ended_at)), localParts(s.started_at));
    await patch(`location_stops?id=eq.${s.id}`, { status: "filled", place_id: place.id, confidence: 1, applied_at: now });
    log.push(`answer applied: ${answer}`);
  }
}

// ---------- main ----------
async function main() {
  if (!URL || !KEY) { console.error(`SUPABASE_URL / SUPABASE_SERVICE_KEY not set (looked in ${envPath})`); process.exit(1); }
  const log = [];
  const people = await get("profiles?select=id,display_name");
  const places = await get("places?select=*");
  const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const calendar = await get(`calendar_events?date=gte.${since}&select=person,date,start_time,end_time,title,place`).catch(() => []);

  await applyAnswers(places, log);
  for (const person of people) {
    try { await processPerson(person, places, calendar, log); }
    catch (e) { log.push(`${person.display_name}: ERROR ${e.message}`); }
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  await del(`locations?recorded_at=lt.${cutoff}`).catch((e) => log.push(`retention: ${e.message}`));

  const open = await get("location_stops?status=eq.question&select=id").catch(() => []);
  const summary = (log.length ? log.join("; ") : "no new points") + `; ${open.length} open question${open.length === 1 ? "" : "s"}`;
  const state = log.some((l) => l.includes("ERROR")) ? "error" : "ok";
  await rest("POST", "system_status?on_conflict=key", [{ key: "sync_location", state, summary: `Location agent: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${new Date().toISOString()} ${summary}`);
}

export { cluster, distM, localParts };
if (process.argv[1] && process.argv[1].endsWith("location-agent.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
