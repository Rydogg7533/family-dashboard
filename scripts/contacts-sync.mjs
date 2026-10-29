#!/usr/bin/env node
// Mac mini → Apple Contacts sync (F25). Runs every 30 minutes via launchd. No model, no dependencies: Node 20+.
//
// Pulls each configured person's iCloud Contacts over CardDAV and upserts them into contact_cards.
// One-way for now (iCloud → dashboard); write-back is the next step. Cards that disappear from iCloud are
// marked deleted_at, never removed.
//
// Secrets: ~/_secrets_local_only/family-dashboard.env
//   SUPABASE_URL, SUPABASE_SERVICE_KEY                    (same as the other mini jobs)
//   ICLOUD_CONTACTS_1="Ryan|apple-id@icloud.com|xxxx-xxxx-xxxx-xxxx"
//   ICLOUD_CONTACTS_2="Melissa|her-apple-id@icloud.com|xxxx-xxxx-xxxx-xxxx"   (when she chooses)
// The third field is an app-specific password from appleid.apple.com › Sign-In and Security › App-Specific
// Passwords. It can be revoked there at any time, which stops the sync. Nothing here ever leaves the mini
// except the cards themselves, posted to the household's own Supabase project.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DISCOVERY = "https://contacts.icloud.com/";

// ---------- env ----------
const envPath = join(homedir(), "_secrets_local_only", "family-dashboard.env");
const env = {};
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* reported in main() */ }
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- PostgREST ----------
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => rest("GET", p);

// ---------- CardDAV ----------
function davHeaders(user, pass, extra = {}) {
  return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`, "Content-Type": "application/xml; charset=utf-8", "User-Agent": "StewardOS contacts-sync", ...extra };
}
async function dav(method, url, user, pass, body, depth) {
  // iCloud answers discovery on contacts.icloud.com and then redirects to p##-contacts.icloud.com; follow by hand
  // so the Authorization header is re-sent (fetch drops it across hosts).
  for (let hop = 0; hop < 5; hop++) {
    const r = await fetch(url, { method, headers: davHeaders(user, pass, depth == null ? {} : { Depth: String(depth) }), body, redirect: "manual" });
    if ([301, 302, 307, 308].includes(r.status)) { url = new globalThis.URL(r.headers.get("location"), url).toString(); continue; }
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${text.slice(0, 200)}`);
    return { url, text };
  }
  throw new Error(`too many redirects for ${url}`);
}
const unesc = (s) => s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(/^x/i.test(n) ? parseInt(n.slice(1), 16) : parseInt(n, 10))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function tag(xml, name) { const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i")); return m ? m[1] : null; }
function tags(xml, name) { const out = []; const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "gi"); let m; while ((m = re.exec(xml))) out.push(m[1]); return out; }
const hrefIn = (xml) => { const h = tag(xml, "href"); return h ? unesc(h.trim()) : null; };

async function findAddressbooks(user, pass) {
  const p1 = await dav("PROPFIND", DISCOVERY, user, pass, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`, 0);
  const principal = hrefIn(tag(p1.text, "current-user-principal") || "");
  if (!principal) throw new Error("no principal in discovery response");
  const principalUrl = new globalThis.URL(principal, p1.url).toString();
  const p2 = await dav("PROPFIND", principalUrl, user, pass, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><c:addressbook-home-set/></d:prop></d:propfind>`, 0);
  const home = hrefIn(tag(p2.text, "addressbook-home-set") || "");
  if (!home) throw new Error("no addressbook-home-set");
  const homeUrl = new globalThis.URL(home, p2.url).toString();
  const p3 = await dav("PROPFIND", homeUrl, user, pass, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`, 1);
  const books = [];
  for (const resp of tags(p3.text, "response")) {
    if (/<(?:[\w-]+:)?addressbook(?=[\s\/>])/i.test(tag(resp, "resourcetype") || "")) {
      const h = hrefIn(resp); if (h) books.push({ url: new globalThis.URL(h, p3.url).toString(), name: unesc(tag(resp, "displayname") || "Contacts") });
    }
  }
  if (!books.length) throw new Error("no addressbooks found at " + homeUrl + ". Apple replied: " + p3.text.replace(/\s+/g, " ").slice(0, 700));
  return books;
}

async function listCards(book, user, pass) {
  const r = await dav("PROPFIND", book.url, user, pass, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>`, 1);
  const cards = [];
  for (const resp of tags(r.text, "response")) {
    const h = hrefIn(resp); const etag = tag(resp, "getetag");
    if (!h || !etag || /collection/i.test(tag(resp, "resourcetype") || "")) continue;
    if (!/\.vcf$/i.test(h) && !/vcard/i.test(resp)) continue;
    cards.push({ href: new globalThis.URL(h, r.url).toString(), path: h, etag: unesc(etag.trim()) });
  }
  return cards;
}

async function fetchCards(book, hrefs, user, pass) {
  const out = [];
  for (let i = 0; i < hrefs.length; i += 100) {
    const chunk = hrefs.slice(i, i + 100);
    const body = `<?xml version="1.0"?><c:addressbook-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><c:address-data/></d:prop>${chunk.map((h) => `<d:href>${h.replace(/&/g, "&amp;")}</d:href>`).join("")}</c:addressbook-multiget>`;
    const r = await dav("REPORT", book.url, user, pass, body, 1);
    for (const resp of tags(r.text, "response")) {
      const h = hrefIn(resp); const etag = tag(resp, "getetag"); const data = tag(resp, "address-data");
      if (h && data) out.push({ path: h, etag: etag ? unesc(etag.trim()) : null, vcard: unesc(data) });
    }
  }
  return out;
}

// ---------- vCard ----------
function unfold(text) { return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); }
function decodeValue(v, params) {
  let s = v;
  if (/QUOTED-PRINTABLE/i.test(params)) s = Buffer.from(s.replace(/=\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8");
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}
function splitSemi(v) { const out = []; let cur = ""; for (let i = 0; i < v.length; i++) { const c = v[i]; if (c === "\\" && i + 1 < v.length) { cur += c + v[++i]; } else if (c === ";") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map((x) => decodeValue(x, "")); }
function labelFrom(params, groupLabel) {
  if (groupLabel) return groupLabel.replace(/^_\$!<|>!\$_$/g, "").toLowerCase();
  const m = params.match(/TYPE=([^;:]+)/gi) || [];
  const types = m.flatMap((x) => x.slice(5).split(",")).map((t) => t.replace(/^"|"$/g, "").toLowerCase()).filter((t) => !["pref", "voice", "internet"].includes(t));
  const t = types[0] || "other";
  return t === "cell" ? "mobile" : t;
}
function parseVcard(text) {
  const lines = unfold(text).split("\n").filter(Boolean);
  const card = { uid: null, full_name: "", first_name: null, last_name: null, nickname: null, org: null, phones: [], emails: [], addresses: [], birthday: null, notes: null, photo: null };
  const groupLabels = {}; const pending = [];
  for (const line of lines) {
    const idx = line.indexOf(":"); if (idx < 0) continue;
    let left = line.slice(0, idx), value = line.slice(idx + 1);
    let group = null; const g = left.match(/^([^.;]+)\.(.+)$/); if (g) { group = g[1]; left = g[2]; }
    const [prop, ...pp] = left.split(";"); const params = pp.join(";"); const P = prop.toUpperCase();
    if (P === "X-ABLABEL") { groupLabels[group] = decodeValue(value, params); continue; }
    switch (P) {
      case "UID": card.uid = decodeValue(value, params); break;
      case "FN": card.full_name = decodeValue(value, params); break;
      case "N": { const [last, first] = splitSemi(value); card.last_name = last || null; card.first_name = first || null; break; }
      case "NICKNAME": card.nickname = decodeValue(value, params) || null; break;
      case "ORG": card.org = splitSemi(value).filter(Boolean).join(" ") || null; break;
      case "NOTE": card.notes = decodeValue(value, params) || null; break;
      case "BDAY": { const v = decodeValue(value, params).replace(/T.*$/, ""); card.birthday = /^\d{4}-?\d{2}-?\d{2}$/.test(v) ? v.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") : (/^--?\d{2}-?\d{2}$/.test(v) ? v.replace(/^-?-?(\d{2})-?(\d{2})$/, "--$1-$2") : null); break; }
      case "TEL": { const number = decodeValue(value, params).replace(/^tel:/i, ""); pending.push({ kind: "phones", group, params, item: { number, digits: number.replace(/\D/g, "") } }); break; }
      case "EMAIL": pending.push({ kind: "emails", group, params, item: { address: decodeValue(value, params).toLowerCase() } }); break;
      case "PHOTO": { // inline base64 (vCard 3: ENCODING=b / vCard 4: data: URI); a URL photo is left alone
        const m = value.match(/^data:image\/\w+;base64,(.+)$/i); const b64 = m ? m[1] : (/ENCODING=b/i.test(params) ? value : null);
        if (b64) card.photo = Buffer.from(b64.replace(/\s+/g, ""), "base64"); break; }
      case "ADR": { const [, , street, city, state, zip, country] = splitSemi(value); pending.push({ kind: "addresses", group, params, item: { street: street || "", city: city || "", state: state || "", zip: zip || "", country: country || "" } }); break; }
      default: break;
    }
  }
  for (const p of pending) card[p.kind].push({ label: labelFrom(p.params, p.group ? groupLabels[p.group] : null), ...p.item });
  if (!card.full_name) card.full_name = [card.first_name, card.last_name].filter(Boolean).join(" ") || card.org || "(no name)";
  return card;
}

// ---------- photos → private bucket avatars/<person>/<uid>.jpg ----------
async function putPhoto(personId, uid, bytes) {
  const path = `${personId}/${encodeURIComponent(uid)}.jpg`;
  const r = await fetch(`${URL}/storage/v1/object/avatars/${path}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: bytes });
  if (!r.ok) throw new Error(`photo upload → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return path;
}

// ---------- per-person sync ----------
async function syncPerson(cfg, log) {
  const people = await get(`profiles?select=id,display_name&display_name=ilike.${encodeURIComponent(cfg.name)}`);
  if (!people.length) throw new Error(`no profile named ${cfg.name}`);
  const person = people[0];
  // A person who chose Google (or none) in the app is not synced from iCloud. No row means iCloud, as before.
  const [choice] = await get(`person_connections?person=eq.${person.id}&kind=eq.contacts&select=provider`).catch(() => []);
  if (choice && choice.provider !== "icloud") { log.push(`${person.display_name}: skipped (contacts source is ${choice.provider})`); return; }
  const books = await findAddressbooks(cfg.user, cfg.pass);
  const existing = new Map();
  for (let from = 0; ; from += 1000) {
    const page = await rest("GET", `contact_cards?person=eq.${person.id}&provider=eq.icloud&select=id,uid,etag,deleted_at,photo_path,photo_hash`, undefined, { Range: `${from}-${from + 999}` });
    for (const r of page) existing.set(r.uid, r);
    if (page.length < 1000) break;
  }
  const seen = new Set(); let upserted = 0, unchanged = 0;
  for (const book of books) {
    const listed = await listCards(book, cfg.user, cfg.pass);
    // Only fetch cards whose etag changed; we need uid ↔ href, so first-run fetches everything.
    const need = process.argv.includes("--refetch") ? listed : listed.filter((c) => ![...existing.values()].some((e) => e.etag === c.etag && !e.deleted_at));
    unchanged += listed.length - need.length;
    for (const e of existing.values()) if (listed.some((c) => c.etag === e.etag)) seen.add(e.uid);
    const fetched = need.length ? await fetchCards(book, need.map((c) => c.path), cfg.user, cfg.pass) : [];
    const rows = []; let photos = 0;
    for (const f of fetched) {
      const card = parseVcard(f.vcard);
      if (!card.uid) card.uid = f.path;
      seen.add(card.uid);
      // photo: upload when new or changed (hash), keep the old path when the card lost its photo? no — a removed photo is removed here too
      let photo_path = null, photo_hash = null;
      if (card.photo) {
        photo_hash = createHash("sha1").update(card.photo).digest("hex");
        const prev = existing.get(card.uid);
        if (prev?.photo_hash === photo_hash && prev.photo_path) photo_path = prev.photo_path;
        else { try { photo_path = await putPhoto(person.id, card.uid, card.photo); photos++; } catch (e) { log.push(`photo for ${card.full_name}: ${e.message}`); photo_hash = null; } }
      }
      rows.push({ person: person.id, provider: "icloud", uid: card.uid, href: f.path, etag: f.etag, full_name: card.full_name, first_name: card.first_name, last_name: card.last_name, nickname: card.nickname, org: card.org, phones: card.phones, emails: card.emails, addresses: card.addresses, birthday: card.birthday, notes: card.notes, photo_path, photo_hash, synced_at: new Date().toISOString(), deleted_at: null });
    }
    if (photos) log.push(`${person.display_name}: ${photos} photo(s) stored`);
    for (let i = 0; i < rows.length; i += 200) {
      await rest("POST", "contact_cards?on_conflict=person,uid", rows.slice(i, i + 200), { Prefer: "resolution=merge-duplicates,return=minimal" });
      upserted += Math.min(200, rows.length - i);
    }
  }
  const gone = [...existing.values()].filter((e) => !seen.has(e.uid) && !e.deleted_at);
  for (let i = 0; i < gone.length; i += 200) {
    await rest("PATCH", `contact_cards?id=in.(${gone.slice(i, i + 200).map((g) => g.id).join(",")})`, { deleted_at: new Date().toISOString() }, { Prefer: "return=minimal" });
  }
  log.push(`${person.display_name}: ${upserted} updated, ${unchanged} unchanged, ${gone.length} removed`);
}

async function main() {
  if (!URL || !KEY) { console.error(`SUPABASE_URL / SUPABASE_SERVICE_KEY not set (looked in ${envPath})`); process.exit(1); }
  const configs = Object.entries(env).filter(([k]) => /^ICLOUD_CONTACTS_\d+$/.test(k)).map(([, v]) => { const [name, user, pass] = v.split("|").map((s) => s.trim()); return { name, user, pass }; }).filter((c) => c.name && c.user && c.pass);
  if (!configs.length) { console.error(`no ICLOUD_CONTACTS_n lines in ${envPath}`); process.exit(1); }
  const log = []; let state = "ok";
  for (const cfg of configs) {
    try { await syncPerson(cfg, log); }
    catch (e) { state = "error"; log.push(`${cfg.name}: ERROR ${e.message}`); }
  }
  const summary = log.join("; ");
  await rest("POST", "system_status?on_conflict=key", [{ key: "sync_contacts", state, summary: `Contacts: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${new Date().toISOString()} ${summary}`);
  if (state === "error") process.exit(1);
}

export { parseVcard, unesc, dav, davHeaders, findAddressbooks, fetchCards, tag, tags, hrefIn, rest, get, env, URL as SUPABASE_URL, KEY as SUPABASE_KEY };
if (process.argv[1] && process.argv[1].endsWith("contacts-sync.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
