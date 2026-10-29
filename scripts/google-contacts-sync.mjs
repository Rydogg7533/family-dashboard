#!/usr/bin/env node
// Mac mini → Google Contacts sync (F25c, read side). Runs every 30 minutes via launchd. No model, no dependencies: Node 20+.
//
// For every person whose Contacts source is Google (person_connections, set in the app under Settings › Contacts source),
// pulls their contacts from the Google People API and upserts them into contact_cards (provider 'google').
//   • After the first full pull it asks Google only for what changed (a sync token). Once a day it does a full pass, which is
//     also how cards deleted in Google are noticed. A card that is gone is marked deleted_at, never removed.
//   • The person's status (waiting / ok / error) is written back to person_connections so the app can show it.
//   • Nothing is ever written to Google here. Writes are in google-contacts-push.mjs.
//
// Secrets (never printed, never leave the mini except to Google and the household's own Supabase):
//   ~/_secrets_local_only/family-dashboard.env                       SUPABASE_URL, SUPABASE_SERVICE_KEY
//   ~/_secrets_local_only/email-agent/google-oauth-client.json       the household's Google OAuth client
//   ~/_secrets_local_only/email-agent/google-<address>.contacts.json one person's contacts sign-in:
//       node scripts/google-auth.mjs --account <address> --purpose contacts
// Flags: --dry (read and report, change nothing)  --full (ignore the sync token)  --person <name>

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PERSON_FIELDS, personToCard, cardRow } from "./google-contacts-lib.mjs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FULL = args.includes("--full");
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ONLY = opt("--person")?.toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- env ----------
const readEnv = (p) => { const o = {}; if (!existsSync(p)) return o; for (const line of readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return o; };
export const secretsDir = join(homedir(), "_secrets_local_only");
export const env = readEnv(join(secretsDir, "family-dashboard.env"));
export const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- PostgREST ----------
export async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
export const get = (p) => rest("GET", p);

// Contact photos → the private avatars bucket (<person>/<uid>.jpg), same place the iCloud sync puts them.
// Google's photo URL changes when the photo changes, so its hash is the change key; unchanged = no download.
async function storePhoto(personId, uid, url) {
  const r = await fetch(url.replace(/=s\d+(-c)?$/, "=s256-c"));
  if (!r.ok) throw new Error(`photo download → ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const path = `${personId}/${encodeURIComponent(uid)}.jpg`;
  const u = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": r.headers.get("content-type") || "image/jpeg", "x-upsert": "true" }, body: bytes });
  if (!u.ok) throw new Error(`photo upload → ${u.status} ${(await u.text()).slice(0, 200)}`);
  return path;
}

// ---------- Google People API ----------
// One session for one person's saved contacts sign-in. A real answer from Google (4xx) is an error with .status and
// .googleStatus; dropped connections, 429 and 5xx are retried quietly.
export function openPeople(account, { base = "https://people.googleapis.com", tokenUrl = "https://oauth2.googleapis.com/token", dir = join(secretsDir, "email-agent"), client: clientOverride, token: tokenOverride } = {}) {
  let client = clientOverride, tok = tokenOverride;
  if (!client) { const j = JSON.parse(readFileSync(join(dir, "google-oauth-client.json"), "utf8")); client = j.installed || j.web; }
  if (!tok) tok = JSON.parse(readFileSync(join(dir, `google-${account}.contacts.json`), "utf8"));
  let access = null;
  const net = async (url, init) => { for (let i = 1; ; i++) { try { return await fetch(url, init); } catch (e) { if (i >= 4) throw e; await sleep(1500 * i); } } };
  async function refresh() {
    const r = await net(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: tok.refresh_token, grant_type: "refresh_token" }) });
    const j = await r.json();
    if (!r.ok) { const e = new Error(`could not refresh the Google login (${j.error || r.status}${j.error === "invalid_grant" ? ": access was revoked or expired; run google-auth.mjs --purpose contacts again" : ""})`); e.status = r.status; e.googleStatus = j.error; throw e; }
    access = j.access_token;
  }
  async function api(path, { method = "GET", body } = {}) {
    if (!access) await refresh();
    for (let attempt = 1; attempt <= 6; attempt++) {
      const r = await net(base + path, { method, headers: { Authorization: `Bearer ${access}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (r.ok) { const t = await r.text(); return t ? JSON.parse(t) : {}; }
      if (r.status === 401 && attempt < 3) { await refresh(); continue; }
      let status = "", message = "";
      try { const j = await r.json(); status = j?.error?.status || ""; message = j?.error?.message || ""; } catch { /* no JSON body */ }
      if (r.status === 429 || r.status >= 500) { await sleep(1000 * attempt ** 2 + Math.random() * 1000); continue; }
      const e = new Error(`People API ${method} ${path.split("?")[0]} → ${r.status}${status ? ` [${status}]` : ""}${message ? ` ${message.slice(0, 200)}` : ""}`);
      e.status = r.status; e.googleStatus = status; e.googleMessage = message; throw e;
    }
    throw new Error(`People API ${path.split("?")[0]}: gave up after retries`);
  }
  return { api, account };
}

// Everything (or, with a sync token, only what changed). Returns { people, nextSyncToken }.
export async function pullConnections(api, syncToken) {
  const people = []; let pageToken, nextSyncToken = null;
  for (;;) {
    const q = new URLSearchParams({ personFields: PERSON_FIELDS, pageSize: "1000", requestSyncToken: "true", sources: "READ_SOURCE_TYPE_CONTACT" });
    if (syncToken) q.set("syncToken", syncToken);
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(`/v1/people/me/connections?${q}`);
    people.push(...(j.connections || []));
    pageToken = j.nextPageToken;
    if (!pageToken) { nextSyncToken = j.nextSyncToken || null; break; }
  }
  return { people, nextSyncToken };
}
const isExpired = (e) => e?.status === 400 && /sync ?token/i.test(`${e.googleMessage || ""} ${e.message}`);

// ---------- one person ----------
const DAY = 864e5;
async function syncPerson(conn, profile, log) {
  const setStatus = async (status, note, extra = {}) => {
    if (DRY) return;
    await rest("PATCH", `person_connections?person=eq.${conn.person}&kind=eq.contacts`, { status, status_note: note, ...extra }, { Prefer: "return=minimal" });
  };
  const tokenFile = join(secretsDir, "email-agent", `google-${conn.account}.contacts.json`);
  if (!existsSync(tokenFile)) {
    const note = `Waiting for ${profile.display_name}'s Google sign-in on the Mac mini: node scripts/google-auth.mjs --account ${conn.account} --purpose contacts`;
    await setStatus("waiting", note); log.push(`${profile.display_name}: ${note}`); return "waiting";
  }
  const { api } = openPeople(conn.account);
  let cursor = null;
  try { const c = JSON.parse(conn.sync_cursor || "null"); if (c?.account === conn.account && c.token) cursor = c; } catch { /* no usable cursor: full pass */ }
  let isFull = FULL || !cursor || Date.now() - Date.parse(cursor.full_at || 0) > DAY;
  let pulled;
  try { pulled = await pullConnections(api, isFull ? null : cursor.token); }
  catch (e) { if (!isFull && isExpired(e)) { isFull = true; pulled = await pullConnections(api, null); } else throw e; }
  const existing = new Map();
  for (let from = 0; ; from += 1000) {
    const page = await rest("GET", `contact_cards?person=eq.${conn.person}&provider=eq.google&select=id,uid,etag,deleted_at,photo_path,photo_hash`, undefined, { Range: `${from}-${from + 999}` });
    for (const r of page) existing.set(r.uid, r);
    if (page.length < 1000) break;
  }
  const rows = []; const goneIds = []; const seen = new Set(); let unchanged = 0;
  for (const p of pulled.people) {
    if (!p.resourceName) continue;
    if (p.metadata?.deleted) { const e = existing.get(p.resourceName); if (e && !e.deleted_at) goneIds.push(e.id); continue; }
    seen.add(p.resourceName);
    const card = personToCard(p); const e = existing.get(card.uid);
    if (e && !e.deleted_at && e.etag === card.etag) { unchanged++; continue; }
    if (card.photo_url) {
      card.photo_hash = createHash("sha1").update(card.photo_url).digest("hex");
      if (e?.photo_hash === card.photo_hash && e.photo_path) card.photo_path = e.photo_path;
      else if (!DRY) { try { card.photo_path = await storePhoto(conn.person, card.uid, card.photo_url); } catch (err) { log.push(`photo for ${card.full_name}: ${err.message}`); card.photo_hash = null; } }
    }
    rows.push(cardRow(conn.person, card));
  }
  if (isFull) for (const e of existing.values()) if (!e.deleted_at && !seen.has(e.uid)) goneIds.push(e.id);
  // The person's own old-provider cards stay hidden; nothing here touches them.
  if (!DRY) {
    for (let i = 0; i < rows.length; i += 200) await rest("POST", "contact_cards?on_conflict=person,uid", rows.slice(i, i + 200), { Prefer: "resolution=merge-duplicates,return=minimal" });
    for (let i = 0; i < goneIds.length; i += 100) await rest("PATCH", `contact_cards?id=in.(${goneIds.slice(i, i + 100).join(",")})`, { deleted_at: new Date().toISOString() }, { Prefer: "return=minimal" });
  }
  const keep = pulled.nextSyncToken ? JSON.stringify({ account: conn.account, token: pulled.nextSyncToken, full_at: isFull ? new Date().toISOString() : cursor?.full_at || new Date().toISOString() }) : null;
  await setStatus("ok", null, { last_synced_at: new Date().toISOString(), ...(keep ? { sync_cursor: keep } : {}) });
  log.push(`${profile.display_name} (Google): ${rows.length} updated, ${unchanged} unchanged, ${goneIds.length} removed${isFull ? " (full pass)" : ""}`);
  return "ok";
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set"); process.exit(1); }
  const conns = await get("person_connections?kind=eq.contacts&provider=eq.google&select=person,account,sync_cursor");
  const log = []; let state = "ok";
  if (!conns.length) log.push("no one has chosen Google Contacts");
  for (const conn of conns) {
    const [profile] = await get(`profiles?id=eq.${conn.person}&select=id,display_name`);
    if (!profile || (ONLY && profile.display_name.toLowerCase() !== ONLY)) continue;
    try { await syncPerson(conn, profile, log); }
    catch (e) {
      state = "error"; log.push(`${profile.display_name}: ERROR ${e.message}`);
      if (!DRY) await rest("PATCH", `person_connections?person=eq.${conn.person}&kind=eq.contacts`, { status: "error", status_note: String(e.message).slice(0, 300) }, { Prefer: "return=minimal" }).catch(() => {});
    }
  }
  const summary = log.join("; ");
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "sync_google_contacts", state, summary: `Google Contacts: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${new Date().toISOString()}${DRY ? " [dry]" : ""} ${summary}`);
  if (state === "error") process.exit(1);
}
if (process.argv[1] && process.argv[1].endsWith("google-contacts-sync.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
