#!/usr/bin/env node
// Messages mirror (F16): a window on THIS person's own Messages threads. Runs on the person's own Mac, signed in as them.
//   node scripts/messages-mirror.mjs --list-chats     # one-time: shows your chats (identifier, message count) so you can pick the family ones
//   node scripts/messages-mirror.mjs --dry            # reads and reports; writes nothing, sends nothing
//   node scripts/messages-mirror.mjs                  # one pass
//   node scripts/messages-mirror.mjs --watch          # what launchd runs: stays up, mirrors within ~0.5 s of a change, sends the instant a line is queued
// Each run: 1) copies ~/Library/Messages/chat.db to a private temp copy (read-only; the live database is never opened for writing),
//           2) mirrors FAMILY THREADS ONLY (chats whose members are all in MIRROR_FAMILY_HANDLES) for the last MIRROR_DAYS days into
//              messages_threads / messages for MIRROR_PERSON_ID, 3) sends lines queued in messages_outbox through the Messages app
//              as the signed-in account (they then appear on every device like a typed message), 4) queues one notification
//              (type=message) per new inbound line so the app can show a bubble and a push, 5) judges each new inbound line
//              once (one Haiku call, scripts/message-suggest-lib.mjs) and records the judgment in message_suggestions,
//              6) writes system_status sync_messages. Set MIRROR_SUGGEST=off in the env file to skip 5.
// --watch also holds a Supabase Realtime subscription on messages_outbox: a queued line is sent immediately, before any mirror pass.
// Photos, videos and GIFs are copied into the private message-media bucket (images resized to 1600 px JPEG via sips,
// video/GIF as-is up to 50 MB) so the thread looks like Messages; copies are removed when the line leaves the window.
// Never deletes anything in Messages.
// Mirror rows older than the window are removed from the database (they are a copy; Messages and iCloud keep the history).
// Secrets and settings: ~/_secrets_local_only/family-dashboard.env  (SUPABASE_URL, SUPABASE_SERVICE_KEY, MIRROR_PERSON_ID,
//   MIRROR_FAMILY_HANDLES="Melissa=+18015551234,Melissa=melissa@icloud.com,Child=+1801...", MIRROR_DAYS=30). Never printed.
// Needs: Full Disk Access for the node binary that runs it (to read chat.db) and Automation permission for Messages (to send).
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, rmSync, copyFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { judge, decide, MODEL, DEFAULT_BAR } from "./message-suggest-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry"), LIST = args.includes("--list-chats"), WATCH = args.includes("--watch");
const envPath = join(homedir(), "_secrets_local_only", "family-dashboard.env");
const env = {}; try { for (const l of readFileSync(envPath, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const PERSON = env.MIRROR_PERSON_ID, ME = env.MIRROR_MY_NAME || "Ryan", DAYS = parseInt(env.MIRROR_DAYS || "30", 10);
const FAMILY = new Map(); // handle -> name
for (const part of (env.MIRROR_FAMILY_HANDLES || "").split(",")) { const [name, handle] = part.split("=").map((s) => s?.trim()); if (name && handle) FAMILY.set(handle.toLowerCase(), name); }
const now = () => new Date().toISOString();

// ---- read a private copy of chat.db (never the live file) ----
const DB = join(homedir(), "Library", "Messages", "chat.db");
const TMP = join(tmpdir(), `messages-mirror-${process.getuid()}`); mkdirSync(TMP, { recursive: true, mode: 0o700 });
const COPY = join(TMP, "chat.db");
function snapshot() {
  if (!existsSync(DB)) throw new Error(`Messages database not found at ${DB}`);
  for (const f of ["chat.db", "chat.db-wal", "chat.db-shm"]) rmSync(join(TMP, f), { force: true });
  // Copy the database files (read-only on the source); the live file is never opened for writing.
  try { copyFileSync(DB, COPY); for (const x of ["-wal", "-shm"]) if (existsSync(DB + x)) copyFileSync(DB + x, COPY + x); }
  catch (e) { throw new Error(/EPERM|EACCES|not permitted/i.test(String(e)) ? "cannot read chat.db: give Full Disk Access to the node binary and to Terminal (System Settings › Privacy & Security › Full Disk Access)" : `cannot copy chat.db: ${e.message}`); }
}
const q = (sql) => { const r = spawnSync("sqlite3", ["-json", "-readonly", COPY, sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error((r.stderr || "query failed").trim()); return r.stdout.trim() ? JSON.parse(r.stdout) : []; };
const APPLE_EPOCH = 978307200;
const toIso = (ns) => new Date((Number(ns) / 1e9 + APPLE_EPOCH) * 1000).toISOString();

// Text on recent macOS lives in attributedBody (a typedstream blob); the string sits after the NSString marker.
function bodyText(hex, text) {
  if (text) return text.replace(/￼/g, "").trim(); // the attachment placeholder is not words
  if (!hex) return "";
  try {
    const b = Buffer.from(hex, "hex"); const i = b.indexOf("NSString"); if (i < 0) return "";
    let p = i + 8 + 5; // skip marker and the fixed 5-byte prefix (01 94 84 01 2b)
    let len = b[p]; p++;
    if (len === 0x81) { len = b.readUInt16LE(p); p += 2; } else if (len === 0x82) { len = b.readUInt32LE(p); p += 4; }
    return b.subarray(p, p + len).toString("utf8").replace(/￼/g, "").trim();
  } catch { return ""; }
}

// ---- Supabase ----
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  let r;
  for (let i = 0; ; i++) { // brief network blips ("fetch failed") retry quietly instead of flagging the mirror as paused
    try { r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }); break; }
    catch (e) { if (i >= 3) throw e; await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); }
  }
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function status(state, summary) { if (DRY || LIST) return; await rest("POST", "system_status?on_conflict=key", [{ key: "sync_messages", state, summary, value_num: null, updated_at: now() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {}); }

// ---- send through Messages as the signed-in account ----
function sendViaMessages(chatGuid, text) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `tell application "Messages"\n  set theChat to a reference to chat id "${esc(chatGuid)}"\n  send "${esc(text)}" to theChat\nend tell`;
  // Up to 2 minutes: the first send makes macOS ask "node wants to control Messages", and someone has to click Allow.
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout: 120000 });
  if (r.error?.code === "ETIMEDOUT" || r.signal) throw new Error("Messages did not answer in 2 minutes. If a permission prompt is on the Mac mini screen, click Allow and send again.");
  if (r.status !== 0) throw new Error((r.stderr || "").trim().slice(0, 200) || `osascript exited ${r.status} with no message (Automation permission for Messages may be denied: System Settings › Privacy & Security › Automation › node › Messages)`);
}

// The chat each thread sends into, from the latest pass; lets a queued line go out without waiting for a pass.
const sendTargets = new Map(); // thread id -> chat guid
let familyChats = [], threadGroups = new Map();
const sending = new Set();
async function sendOne(o) {
  if (sending.has(o.id)) return false; sending.add(o.id);
  try {
    const guid = o.thread_id ? sendTargets.get(o.thread_id) : null;
    if (!guid && !o.to_handle) { await rest("PATCH", `messages_outbox?id=eq.${o.id}&status=eq.queued`, { status: "failed", error: "not a mirrored thread" }, { Prefer: "return=minimal" }); return false; }
    let err = null;
    try { if (guid) sendViaMessages(guid, o.text); else sendToHandle(o.to_handle, o.text); } catch (e) { err = String(e.message).slice(0, 300); }
    // Messages sometimes reports an error after the line has already gone out: believe the database, not the error.
    if (err) { await new Promise((r) => setTimeout(r, 4000)); snapshot(); const esc = o.text.replace(/'/g, "''");
      const chatIds = familyChats.filter((c) => guid === c.guid || threadGroups.get(o.thread_id)?.chats.some((x) => x.id === c.id)).map((c) => c.id).join(",") || 0;
      const hit = q(`select count(*) as n from message m join chat_message_join cm on cm.message_id = m.ROWID where cm.chat_id in (${chatIds}) and m.is_from_me = 1 and m.text = '${esc}' and m.date > ${Math.floor((Date.now() / 1000 - 300 - APPLE_EPOCH) * 1e9)}`);
      if (hit[0]?.n > 0) err = null; }
    // status=eq.queued: if a pass and the realtime handler race, only the first writer changes the row
    await rest("PATCH", `messages_outbox?id=eq.${o.id}&status=eq.queued`, err ? { status: "failed", error: err } : { status: "sent", sent_at: now() }, { Prefer: "return=minimal" });
    if (err) console.error(`${now()} send failed for ${o.thread_id}: ${err}`);
    return !err;
  } finally { sending.delete(o.id); }
}

// Inbound lines seen so far (guid). Lines older than the watermark on the first pass are history, not news.
let newsSince = Date.now() - 10 * 60e3; const notified = new Set();
let switches = new Map(); // thread id -> { hidden, assistant_reads }
async function loadSwitches() { switches = new Map((await rest("GET", `messages_threads?person=eq.${PERSON}&select=id,hidden,assistant_reads`).catch(() => [])).map((r) => [r.id, r])); }
async function queueBubbles(msgRows, threadRows) {
  const names = new Map(threadRows.map((t) => [t.id, t.name]));
  await loadSwitches();
  let fresh = msgRows.filter((m) => !m.is_me && !notified.has(m.id) && Date.parse(m.at) > newsSince && !switches.get(m.thread_id)?.hidden);
  if (fresh.length) { // one notification per guid, ever (the partial unique index is the backstop; a restart re-checks here)
    const have = await rest("GET", `notifications?type=eq.message&select=item_id&item_id=in.(${fresh.map((m) => `"${m.id}"`).join(",")})`);
    const seen = new Set(have.map((r) => r.item_id)); for (const id of seen) notified.add(id);
    fresh = fresh.filter((m) => !seen.has(m.id));
  }
  if (!fresh.length) return [];
  const rows = fresh.map((m) => ({ person: PERSON, type: "message", channel: "push", title: names.get(m.thread_id) || m.sender,
    body: `${m.sender}: ${(m.text || `[${m.attachment?.kind || "attachment"}]`).slice(0, 160)}`, url: `/messages/${m.thread_id}`, tag: `thread:${m.thread_id}`,
    item_kind: "message", item_id: m.id }));
  try { await rest("POST", "notifications", rows, { Prefer: "return=minimal" }); }
  catch (e) { if (!/409|23505/.test(String(e.message))) throw e; } // a repeat slipped past the check: the index refused it, nothing to do
  for (const m of fresh) { notified.add(m.id); newsSince = Math.max(newsSince, Date.parse(m.at)); }
  return fresh;
}

// ---- people: names and photos from the person's own Contacts (contact_cards), matched by handle. Family handles come
// from MIRROR_FAMILY_HANDLES first; anyone else is named from their contact card, else shown as the number/email. ----
let people = null, peopleAt = 0; // { names: Map(handle->name), photos: Map(name->photo_path) }
async function loadPeople() {
  if (people && Date.now() - peopleAt < 30 * 60e3) return people;
  const names = new Map(), photos = new Map();
  try {
    const cards = await rest("GET", `contact_cards?person=eq.${PERSON}&deleted_at=is.null&select=full_name,phones,emails,photo_path`);
    const byDigits = new Map(), byEmail = new Map();
    for (const c of cards) { for (const p of c.phones || []) if (p.digits?.length >= 7) byDigits.set(p.digits.slice(-10), c); for (const e of c.emails || []) if (e.address) byEmail.set(e.address.toLowerCase(), c); }
    const cardFor = (h) => h.includes("@") ? byEmail.get(h.toLowerCase()) : byDigits.get(h.replace(/\D/g, "").slice(-10));
    for (const [handle, name] of FAMILY) { names.set(handle, name); const c = cardFor(handle); if (c?.photo_path && !photos.has(name)) photos.set(name, c.photo_path); }
    people = { names, photos, cardFor };
  } catch (e) { console.error(`${now()} contacts: ${String(e.message).slice(0, 120)}`); people = { names: new Map(FAMILY), photos, cardFor: () => null }; }
  peopleAt = Date.now(); return people;
}
const prettyHandle = (h) => /^\+?\d{10,}$/.test(h) ? h.replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") : h;

// ---- suggestion engine: one judgment per new inbound line, written to message_suggestions; the app shows the "shown" ones ----
const AI_KEY = env.ANTHROPIC_API_KEY, SUGGEST = AI_KEY && (env.MIRROR_SUGGEST || "on") !== "off";
const TZ = env.HOUSEHOLD_TZ || "America/Denver";
let bars = null, barsAt = 0;
async function loadBars() {
  if (bars && Date.now() - barsAt < 5 * 60e3) return bars;
  const rows = await rest("GET", `suggestion_bars?person=eq.${PERSON}&select=kind,bar`).catch(() => []);
  bars = Object.fromEntries(rows.map((r) => [r.kind, Number(r.bar)])); barsAt = Date.now(); return bars;
}
let threadRowsFamily = new Map();
async function suggestFor(fresh, msgRows) {
  if (!SUGGEST || !fresh.length) return 0;
  const b = await loadBars();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).format(new Date());
  const household = { me: ME, members: [...new Set([ME, ...FAMILY.values()])] };
  let n = 0;
  const readable = fresh.filter((m) => { const sw = switches.get(m.thread_id); return sw ? sw.assistant_reads : threadRowsFamily.get(m.thread_id); });
  for (const line of readable.slice(-5)) { // a burst judges the last five; older ones in the same burst are context, not chips
    const thread = msgRows.filter((m) => m.thread_id === line.thread_id);
    const i = thread.findIndex((m) => m.id === line.id);
    const context = thread.slice(Math.max(0, i - 6), i);
    let j;
    try { j = await judge({ key: AI_KEY, line, context, household, today, tz: TZ }); }
    catch (e) { console.error(`${now()} suggest: ${String(e.message).slice(0, 160)}`); continue; }
    const status = decide(j, b);
    const row = { person: PERSON, thread_id: line.thread_id, message_id: line.id, kind: j.kind, confidence: j.confidence, title: j.title, payload: j.payload, reason: j.reason,
      status, model: MODEL, in_tokens: j.usage.inTok, out_tokens: j.usage.outTok, latency_ms: j.usage.latencyMs };
    try { await rest("POST", "message_suggestions?on_conflict=person,message_id", [row], { Prefer: "resolution=ignore-duplicates,return=minimal" }); n++; }
    catch (e) { console.error(`${now()} suggest write: ${String(e.message).slice(0, 160)}`); }
    if (status === "shown") console.log(`${now()} chip ${j.kind} ${j.confidence} "${j.title}" (${line.thread_id})`);
  }
  return n;
}

// ---- media: Messages keeps attachments under ~/Library/Messages/Attachments; chat.db holds the path. Each one is copied
// once (keyed by message guid + index) into message-media/<person>/<guid>/<n>.<ext>. Images are resized to 1600 px JPEG
// (HEIC does not show in most browsers); video and GIF go as they are, up to MEDIA_MAX bytes. ----
const MEDIA_MAX = 50 * 1024 * 1024;
const MEDIA_DIR = join(TMP, "media"); mkdirSync(MEDIA_DIR, { recursive: true, mode: 0o700 });
const copied = new Set(); // "<guid>/<n>" already in the bucket this run (and re-checked on restart via the message row)
function mediaKind(mime, name) {
  const ext = (name || "").toLowerCase().split(".").pop();
  if (/^image\/gif$/.test(mime) || ext === "gif") return "gif";
  if (/^image\//.test(mime) || ["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(ext)) return "photo";
  if (/^video\//.test(mime) || ["mov", "mp4", "m4v"].includes(ext)) return "video";
  if (/^audio\//.test(mime)) return "audio";
  return "file";
}
async function putMedia(guid, n, att) {
  const src = att.filename?.startsWith("~") ? join(homedir(), att.filename.slice(1)) : att.filename;
  if (!src || !existsSync(src)) return null;
  const kind = mediaKind(att.mime_type || "", src);
  if (!["photo", "gif", "video"].includes(kind)) return null;
  const st = statSync(src); if (st.size > MEDIA_MAX) return { kind, label: "too large", skipped: "size" };
  let body, mime = att.mime_type || "", ext;
  if (kind === "photo") {
    const out = join(MEDIA_DIR, `${process.pid}-${n}.jpg`);
    const r = spawnSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "--resampleHeightWidthMax", "1600", src, "--out", out], { encoding: "utf8", timeout: 60000 });
    if (r.status !== 0 || !existsSync(out)) return null;
    body = readFileSync(out); rmSync(out, { force: true }); mime = "image/jpeg"; ext = "jpg";
  } else { body = readFileSync(src); ext = kind === "gif" ? "gif" : (src.toLowerCase().split(".").pop() || "mov"); if (!mime) mime = kind === "gif" ? "image/gif" : "video/quicktime"; }
  const path = `${PERSON}/${encodeURIComponent(guid)}/${n}.${ext}`;
  const u = await fetch(`${URL_}/storage/v1/object/message-media/${path}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": mime, "x-upsert": "true" }, body });
  if (!u.ok) throw new Error(`media upload → ${u.status} ${(await u.text()).slice(0, 160)}`);
  let w = null, h = null;
  if (kind === "photo") { const d = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src], { encoding: "utf8" }).stdout || ""; const mw = d.match(/pixelWidth: (\d+)/), mh = d.match(/pixelHeight: (\d+)/); if (mw && mh) { const s = Math.min(1, 1600 / Math.max(+mw[1], +mh[1])); w = Math.round(+mw[1] * s); h = Math.round(+mh[1] * s); } }
  return { kind, label: kind, mime, path, bytes: body.length, w, h };
}
async function pruneMedia(rows) {
  for (const r of rows) { const path = r.attachment?.path; if (!path) continue;
    await fetch(`${URL_}/storage/v1/object/message-media/${path}`, { method: "DELETE", headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).catch(() => {}); mediaKnown.delete(r.id); }
}
// Lines already holding a copied path are not copied again (survives restarts).
let mediaKnown = new Map(); // guid -> attachment json
async function loadMediaKnown() { mediaKnown = new Map((await rest("GET", `messages?person=eq.${PERSON}&attachment=not.is.null&select=id,attachment`).catch(() => [])).map((r) => [r.id, r.attachment])); }

// A new conversation: address the person, not a chat. iMessage first; SMS when the handle is a number with no iMessage.
function sendToHandle(handle, text) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `tell application "Messages"
  set ok to false
  try
    set acct to 1st account whose service type = iMessage
    send "${esc(text)}" to participant "${esc(handle)}" of acct
    set ok to true
  end try
  if not ok then
    set acct to 1st account whose service type = SMS
    send "${esc(text)}" to participant "${esc(handle)}" of acct
  end if
end tell`;
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout: 120000 });
  if (r.error?.code === "ETIMEDOUT" || r.signal) throw new Error("Messages did not answer in 2 minutes.");
  if (r.status !== 0) throw new Error((r.stderr || "").trim().slice(0, 200) || `osascript exited ${r.status}`);
}

async function main() {
  if (!URL_ || !KEY) throw new Error(`SUPABASE_URL / SUPABASE_SERVICE_KEY missing in ${envPath}`);
  snapshot();
  const chats = q(`select c.ROWID as id, c.guid, c.chat_identifier as ident, c.display_name as name, c.style,
      (select group_concat(lower(h.id), '|') from chat_handle_join j join handle h on h.ROWID = j.handle_id where j.chat_id = c.ROWID) as handles,
      (select count(*) from chat_message_join cm where cm.chat_id = c.ROWID) as n
    from chat c where c.service_name = 'iMessage' or c.service_name = 'SMS'`);
  if (LIST) {
    console.log("Your chats (local only, nothing sent anywhere). Put the family ones in MIRROR_FAMILY_HANDLES as Name=handle:");
    for (const c of chats.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 40)) console.log(`  ${String(c.n).padStart(6)}  ${c.style === 43 ? "group " : "direct"}  ${c.name || c.ident}  [${(c.handles || "").split("|").join(", ")}]`);
    return;
  }
  if (!PERSON || !FAMILY.size) throw new Error("MIRROR_PERSON_ID or MIRROR_FAMILY_HANDLES missing in the env file (run --list-chats to find the handles)");
  const sinceNs = (Date.now() / 1000 - DAYS * 86400 - APPLE_EPOCH) * 1e9;
  // Every conversation with a line inside the window (not only family): the app is a window on Messages. Family is a
  // flag on the thread (all handles in MIRROR_FAMILY_HANDLES), which decides whether the assistant reads it by default.
  const Pn = await loadPeople();
  const active = new Set(q(`select distinct cm.chat_id as id from message m join chat_message_join cm on cm.message_id = m.ROWID where m.date > ${Math.floor(sinceNs)}`).map((r) => r.id));
  const family = chats.filter((c) => c.handles && active.has(c.id));
  const nameOf = (h) => { const k = (h || "").toLowerCase(); return FAMILY.get(k) || Pn.cardFor(k)?.full_name || prettyHandle(h || "?"); };
  // Messages keeps several chats for one person (iMessage vs SMS, number vs email). The app shows ONE thread per set of people:
  // thread id = kind + member names; lines are sent into whichever of its chats spoke most recently.
  const groups = new Map(); // thread id -> { kind, members, chats: [] }
  for (const c of family) {
    const handles = c.handles.split("|");
    const isFamily = handles.every((h) => FAMILY.has(h));
    const members = [...new Set(handles.map(nameOf))].sort();
    const kind = c.style === 43 ? "group" : "direct";
    // family threads keep their name-based ids (pins, notifications and suggestions point at them); others are keyed by
    // their handles so a renamed contact does not become a new thread
    const id = isFamily ? `${kind}-${members.join("-")}`.toLowerCase().replace(/[^a-z0-9-]+/g, "_")
                        : `${kind}-${[...handles].sort().map((h) => h.replace(/[^a-z0-9@.]+/gi, "")).join("-")}`.toLowerCase().replace(/[^a-z0-9@.-]+/g, "_").slice(0, 120);
    if (!groups.has(id)) groups.set(id, { id, kind, members, name: c.name || "", chats: [], isFamily, handles: [...new Set(handles)] });
    const g = groups.get(id); g.chats.push(c); if (c.name && !g.name) g.name = c.name; for (const h of handles) if (!g.handles.includes(h)) g.handles.push(h);
  }
  let msgCount = 0, mediaCount = 0; const threadRows = [], msgRows = [];
  const P = await loadPeople();
  if (!DRY) await loadMediaKnown();
  for (const g of groups.values()) {
    const rows = q(`select m.guid, hex(m.attributedBody) as body, m.text, m.is_from_me as me, m.is_read as read, m.date, m.cache_has_attachments as att, h.id as sender, cm.chat_id as chat,
        (select group_concat(a.mime_type, ',') from message_attachment_join ma join attachment a on a.ROWID = ma.attachment_id where ma.message_id = m.ROWID) as mimes,
        (select group_concat(a.filename, char(10)) from message_attachment_join ma join attachment a on a.ROWID = ma.attachment_id where ma.message_id = m.ROWID and a.hide_attachment = 0 order by a.ROWID) as files
      from message m join chat_message_join cm on cm.message_id = m.ROWID left join handle h on h.ROWID = m.handle_id
      where cm.chat_id in (${g.chats.map((c) => c.id).join(",")}) and m.date > ${Math.floor(sinceNs)} and (m.item_type = 0 or m.item_type is null) order by m.date`);
    let last = null, lastChat = null;
    for (const m of rows) {
      const text = bodyText(m.body, m.text);
      const mime = (m.mimes || "").split(",")[0];
      let attachment = m.att ? { kind: /^image\//.test(mime) ? "photo" : /^video\//.test(mime) ? "video" : /^audio\//.test(mime) ? "audio" : "file", label: mime ? mime.split("/")[1] : "attachment" } : null;
      lastChat = m.chat;
      if (!text && !attachment) continue;
      // media: copy once; afterwards the stored attachment (with its path) is kept as it is
      if (attachment && !DRY) {
        const known = mediaKnown.get(m.guid);
        if (known?.path || known?.skipped) attachment = known;
        else if (m.files) {
          const first = m.files.split("\n")[0]; const mimes = (m.mimes || "").split(",");
          try { const media = await putMedia(m.guid, 0, { filename: first, mime_type: mimes[0] }); if (media) { attachment = media; mediaKnown.set(m.guid, media); mediaCount++; } }
          catch (e) { console.error(`${now()} media ${m.guid}: ${String(e.message).slice(0, 120)}`); }
        }
      }
      const row = { id: m.guid, thread_id: g.id, person: PERSON, sender: m.me ? ME : nameOf(m.sender), is_me: !!m.me, at: toIso(m.date), text: text || null, attachment };
      msgRows.push(row); last = row; msgCount++;
    }
    // where a new line goes: the chat that spoke most recently, else the iMessage chat with the most messages
    const target = g.chats.find((c) => c.id === lastChat) || g.chats.filter((c) => c.guid.startsWith("iMessage")).sort((x, y) => y.n - x.n)[0] || g.chats[0];
    sendTargets.set(g.id, target.guid);
    const unread = rows.filter((m) => !m.me && !m.read).length;
    threadRows.push({ id: g.id, person: PERSON, kind: g.kind, name: g.name || g.members.filter((x) => x !== ME).join(", "), members: [ME, ...g.members.filter((x) => x !== ME)],
      last_line: last ? (last.text || `[${last.attachment?.kind}]`).slice(0, 120) : null, last_at: last?.at ?? null, unread, pending_yn: 0, mirrored: true, updated_at: now(), for_person: ME,
      is_family: g.isFamily, handles: g.handles, avatars: Object.fromEntries(g.members.filter((m) => P.photos.has(m)).map((m) => [m, P.photos.get(m)])) });
  }
  console.log(`${now()} ${threadRows.length} threads (${threadRows.filter((t) => t.is_family).length} family, ${family.length} chats in Messages), ${msgCount} messages in ${DAYS} days${mediaCount ? `, ${mediaCount} media copied` : ""}${DRY ? " (dry: nothing written)" : ""}`);
  if (DRY) { for (const t of threadRows) console.log(`  ${t.kind.padEnd(6)} ${t.name}  (${t.members.join(", ")})  unread ${t.unread}`); return; }

  familyChats = family; threadGroups = groups;
  // bubbles first: the app shows news the moment the row lands, before the slower mirror upserts
  const fresh = WATCH ? await queueBubbles(msgRows, threadRows) : [];
  if (fresh.length) console.log(`${now()} ${fresh.length} new inbound line(s) → notifications`);
  // write (upsert; a re-run changes nothing that is already the same). The person's switches (hidden, assistant_reads)
  // are never in the upsert: a NEW thread gets assistant_reads = is_family in a separate insert, an existing one keeps its own.
  const passStart = now();
  for (const t of threadRows) t.updated_at = passStart;
  const known = new Set((await rest("GET", `messages_threads?person=eq.${PERSON}&select=id`)).map((r) => r.id));
  const fresh_t = threadRows.filter((t) => !known.has(t.id)).map((t) => ({ ...t, assistant_reads: t.is_family }));
  const old_t = threadRows.filter((t) => known.has(t.id));
  for (let i = 0; i < fresh_t.length; i += 50) await rest("POST", "messages_threads?on_conflict=id", fresh_t.slice(i, i + 50), { Prefer: "resolution=merge-duplicates,return=minimal" });
  for (let i = 0; i < old_t.length; i += 50) await rest("POST", "messages_threads?on_conflict=id", old_t.slice(i, i + 50), { Prefer: "resolution=merge-duplicates,return=minimal" });
  for (let i = 0; i < msgRows.length; i += 200) await rest("POST", "messages?on_conflict=id", msgRows.slice(i, i + 200), { Prefer: "resolution=merge-duplicates,return=minimal" });
  // mirror copies only: a thread this pass did not touch has left the window (or Messages); its lines go with it (cascade).
  // Media copies for lines leaving the window are removed from the bucket first (they are copies; Messages keeps the originals).
  const staleThreads = (await rest("GET", `messages_threads?person=eq.${PERSON}&updated_at=lt.${encodeURIComponent(passStart)}&select=id`).catch(() => [])).map((t) => t.id);
  for (const tid of staleThreads) await pruneMedia(await rest("GET", `messages?person=eq.${PERSON}&thread_id=eq.${encodeURIComponent(tid)}&attachment->>path=not.is.null&select=id,attachment`).catch(() => []));
  await rest("DELETE", `messages_threads?person=eq.${PERSON}&updated_at=lt.${encodeURIComponent(passStart)}`, undefined, { Prefer: "return=minimal" });
  const cutoff = new Date(Date.now() - DAYS * 86400e3).toISOString();
  await pruneMedia(await rest("GET", `messages?person=eq.${PERSON}&attachment->>path=not.is.null&at=lt.${cutoff}&select=id,attachment`).catch(() => []));
  await rest("DELETE", `messages?person=eq.${PERSON}&at=lt.${cutoff}`, undefined, { Prefer: "return=minimal" });

  // judge the new lines (after the upserts, so a chip always points at a line the app can show)
  threadRowsFamily = new Map(threadRows.map((t) => [t.id, t.is_family]));
  const judged = await suggestFor(fresh, msgRows);
  if (judged) console.log(`${now()} ${judged} line(s) judged`);

  // send what was typed on the dashboard
  const queued = await rest("GET", `messages_outbox?person=eq.${PERSON}&status=eq.queued&order=queued_at.asc&limit=20&select=id,thread_id,to_handle,text`);
  let sent = 0, failed = 0;
  for (const o of queued) { if (await sendOne(o)) sent++; else failed++; }
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" }).format(new Date());
  const summary = `Messages: ${threadRows.length} family threads, ${msgCount} messages in ${DAYS} days${sent ? `, sent ${sent}` : ""}${failed ? `, ${failed} not sent` : ""} · ${time}`;
  await status(failed ? "warn" : "ok", summary);
  console.log(`${now()} ${summary}`);
}
const fail = async (e) => { console.error(`${now()} messages-mirror: ${e.message}`); await status("error", `Messages mirror paused: ${String(e.message).slice(0, 200)}`); };
if (!WATCH) main().catch(async (e) => { await fail(e); process.exit(1); });
else {
  // Always-on: a pass whenever Messages' database changes (checked every 0.5 s) and at least once a minute. Lines queued on the
  // dashboard arrive over Realtime and are sent at once; a 3 s outbox poll is the fallback if the socket is down.
  // One pass at a time; an error pauses the mirror and is retried.
  const stamp = () => ["chat.db", "chat.db-wal"].map((f) => { try { return statSync(join(homedir(), "Library", "Messages", f)).mtimeMs; } catch { return 0; } }).join("|");
  let lastStamp = "", lastPass = 0, busy = false, again = false;
  const run = async (why) => { if (busy) { again = true; return; } busy = true; try { do { again = false; await main(); lastPass = Date.now(); lastStamp = stamp(); } while (again); } catch (e) { await fail(e); } finally { busy = false; } };
  await run("start");
  setInterval(() => { if (stamp() !== lastStamp) void run("messages changed"); else if (Date.now() - lastPass > 60000) void run("minute"); }, 500);
  const drain = async () => { try { const w = await rest("GET", `messages_outbox?person=eq.${PERSON}&status=eq.queued&order=queued_at.asc&limit=20&select=id,thread_id,to_handle,text`); for (const o of w) await sendOne(o); if (w.length) void run("outbox"); } catch { /* next tick */ } };
  setInterval(drain, 3000);
  const sb = createClient(URL_, KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 5 } } });
  sb.channel("outbox").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages_outbox", filter: `person=eq.${PERSON}` },
    (p) => { const o = p.new; if (o?.status === "queued") void sendOne(o).then(() => run("outbox")); })
    .subscribe((state, err) => { if (state === "SUBSCRIBED") console.log(`${now()} realtime: listening for queued lines`); if (err) console.error(`${now()} realtime: ${err.message}`); });
}
