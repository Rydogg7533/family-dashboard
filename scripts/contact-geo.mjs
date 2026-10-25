#!/usr/bin/env node
// Mac mini job: turns contact addresses into coordinates (contact_geo) so the Places list can suggest "Sarah's home".
// The only outside call is one OpenStreetMap (Nominatim) lookup per NEW address, at most one per second, never repeated for an unchanged address.
// Changed or removed addresses are closed (valid_until), never deleted: the history stays. No model, no dependencies: Node 20+.
// Run by hand to start, then hourly via launchd (scripts/com.ryan.contact-geo.plist). Secrets: ~/_secrets_local_only/family-dashboard.env
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MAX_LOOKUPS_PER_RUN = 450;
const RETRY_NOT_FOUND_DAYS = 30;
const UA = "StewardOS contact-geo (household self-hosted; contact via dashboard)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- pure planning (tested) ----------
const norm = (s) => String(s ?? "").toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
// Only addresses precise enough to place a house: a street with a number and a city or zip.
export function usableAddress(a) {
  const street = String(a?.street ?? "").trim(), city = String(a?.city ?? "").trim(), zip = String(a?.zip ?? "").trim();
  return /\d/.test(street) && (city || zip) ? { street, city, state: String(a?.state ?? "").trim(), zip, label: String(a?.label ?? "").trim() || null } : null;
}
export const addressKey = (a) => [a.street, a.city, a.state, a.zip].map(norm).join("|");
export const addressText = (a) => [a.street, [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");

// cards: active cards [{id, person, full_name, last_name, org, addresses}]; rows: every contact_geo row for those people.
// Returns what to do: close rows, add addresses to look up, retry old not_found rows, refresh the stored name on current rows.
export function planGeo(cards, rows, nowMs = Date.now()) {
  const byCard = new Map(cards.map((c) => [c.id, c]));
  const close = [], add = [], retry = [], rename = [];
  const have = new Set();
  for (const r of rows) {
    if (r.valid_until) continue;
    const c = byCard.get(r.card_id);
    const keys = new Set((c?.addresses ?? []).map(usableAddress).filter(Boolean).map(addressKey));
    if (!c || !keys.has(r.address_key)) { close.push(r.id); continue; }
    have.add(`${r.card_id}|${r.address_key}`);
    if (r.status === "not_found" && nowMs - Date.parse(r.geocoded_at) > RETRY_NOT_FOUND_DAYS * 86400000) retry.push(r.id);
    if (r.name !== c.full_name || (r.last_name ?? null) !== (c.last_name ?? null) || (r.org ?? null) !== (c.org ?? null)) rename.push({ id: r.id, name: c.full_name, last_name: c.last_name ?? null, org: c.org ?? null });
  }
  for (const c of cards) for (const raw of c.addresses ?? []) {
    const a = usableAddress(raw); if (!a) continue;
    const k = addressKey(a);
    if (!have.has(`${c.id}|${k}`)) { add.push({ card: c, address: a, key: k }); have.add(`${c.id}|${k}`); }
  }
  return { close, add, retry, rename };
}

// ---------- OpenStreetMap ----------
// Accept a result only if it is in the US and agrees with the city (or zip) we asked for, so a wrong town never becomes a suggestion.
async function lookup(a) {
  const tryOne = async (qs) => {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&${qs}`, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`nominatim ${r.status}`);
    const [j] = await r.json();
    return j ?? null;
  };
  const ok = (j) => {
    if (!j) return false;
    const ad = j.address ?? {}, hay = norm(Object.values(ad).join(" "));
    return (a.city && hay.includes(norm(a.city))) || (a.zip && norm(ad.postcode ?? "").startsWith(norm(a.zip).slice(0, 5)));
  };
  const enc = encodeURIComponent;
  let j = await tryOne(`street=${enc(a.street)}&city=${enc(a.city)}&state=${enc(a.state)}&postalcode=${enc(a.zip)}`);
  if (!ok(j)) { await sleep(1100); j = await tryOne(`q=${enc(addressText(a))}`); }
  return ok(j) ? { lat: Number(j.lat), lon: Number(j.lon) } : null;
}

// ---------- main ----------
async function main() {
  const env = {};
  try { for (const line of readFileSync(join(homedir(), "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {}
  const URL = env.SUPABASE_URL || process.env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set"); process.exit(1); }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const rest = async (method, path, body, extra = {}) => {
    const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : null;
  };
  const pageAll = async (path) => { const out = []; for (let from = 0; ; from += 1000) { const rows = await rest("GET", path, undefined, { Range: `${from}-${from + 999}`, "Range-Unit": "items" }); out.push(...rows); if (rows.length < 1000) break; } return out; };

  const cards = await pageAll("contact_cards?deleted_at=is.null&select=id,person,full_name,last_name,org,addresses&order=id");
  const rows = await pageAll("contact_geo?select=id,card_id,address_key,status,geocoded_at,valid_until,name,last_name,org&order=id");
  const withAddr = cards.filter((c) => (c.addresses ?? []).some(usableAddress));
  const plan = planGeo(withAddr, rows);
  // A card that was deleted or lost all its addresses must close its rows too: planGeo only sees cards passed in, so a missing card closes.
  const now = new Date().toISOString();
  for (const id of plan.close) await rest("PATCH", `contact_geo?id=eq.${id}`, { valid_until: now }, { Prefer: "return=minimal" });
  for (const x of plan.rename) await rest("PATCH", `contact_geo?id=eq.${x.id}`, { name: x.name, last_name: x.last_name, org: x.org }, { Prefer: "return=minimal" });
  for (const id of plan.retry) await rest("PATCH", `contact_geo?id=eq.${id}`, { valid_until: now }, { Prefer: "return=minimal" });   // closed; the same address is looked up again below on the next run
  let done = 0, found = 0, missed = 0;
  const todo = plan.add.slice(0, MAX_LOOKUPS_PER_RUN);
  for (const t of todo) {
    let g = null;
    try { g = await lookup(t.address); } catch (e) { console.error(`lookup failed (${e.message}); stopping this run, the rest wait for the next`); break; }
    await rest("POST", "contact_geo", [{ person: t.card.person, card_id: t.card.id, address_key: t.key, address_text: addressText(t.address), label: t.address.label, name: t.card.full_name, last_name: t.card.last_name ?? null, org: t.card.org ?? null, lat: g?.lat ?? null, lon: g?.lon ?? null, status: g ? "ok" : "not_found" }], { Prefer: "return=minimal" });
    done++; g ? found++ : missed++;
    if (done % 25 === 0) console.log(`${done}/${todo.length} looked up (${found} placed, ${missed} not found)`);
    await sleep(1100);
  }
  const left = plan.add.length - todo.length;
  const summary = `contact-geo: ${plan.add.length} new addresses (${done} looked up: ${found} placed, ${missed} not found${left > 0 ? `, ${left} left for the next run` : ""}); ${plan.close.length} closed, ${plan.rename.length} renamed`;
  await rest("POST", "system_status?on_conflict=key", [{ key: "sync_contact_geo", state: "ok", summary, value_num: null, updated_at: now }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${now} ${summary}`);
}
if (process.argv[1] && process.argv[1].endsWith("contact-geo.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
