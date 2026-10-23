#!/usr/bin/env node
// Messages mirror (F16): a window on THIS person's own Messages threads. Runs on the person's own Mac, signed in as them.
//   node scripts/messages-mirror.mjs --list-chats     # one-time: shows your chats (identifier, message count) so you can pick the family ones
//   node scripts/messages-mirror.mjs --dry            # reads and reports; writes nothing, sends nothing
//   node scripts/messages-mirror.mjs                  # what launchd runs every 60 s
// Each run: 1) copies ~/Library/Messages/chat.db to a private temp copy (read-only; the live database is never opened for writing),
//           2) mirrors FAMILY THREADS ONLY (chats whose members are all in MIRROR_FAMILY_HANDLES) for the last MIRROR_DAYS days into
//              messages_threads / messages for MIRROR_PERSON_ID, 3) sends lines queued in messages_outbox through the Messages app
//              as the signed-in account (they then appear on every device like a typed message), 4) writes system_status sync_messages.
// Never reads a non-family chat past its handle list; mirrors attachments as {kind,label} only; never deletes anything in Messages.
// Mirror rows older than the window are removed from the database (they are a copy; Messages and iCloud keep the history).
// Secrets and settings: ~/_secrets_local_only/family-dashboard.env  (SUPABASE_URL, SUPABASE_SERVICE_KEY, MIRROR_PERSON_ID,
//   MIRROR_FAMILY_HANDLES="Melissa=+18015551234,Melissa=melissa@icloud.com,Child=+1801...", MIRROR_DAYS=30). Never printed.
// Needs: Full Disk Access for the node binary that runs it (to read chat.db) and Automation permission for Messages (to send).
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry"), LIST = args.includes("--list-chats");
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
  if (text) return text;
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
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  const family = chats.filter((c) => c.handles && c.handles.split("|").every((h) => FAMILY.has(h)));
  const nameOf = (h) => FAMILY.get((h || "").toLowerCase()) || h || "?";
  const sinceNs = (Date.now() / 1000 - DAYS * 86400 - APPLE_EPOCH) * 1e9;
  // Messages keeps several chats for one person (iMessage vs SMS, number vs email). The app shows ONE thread per set of people:
  // thread id = kind + member names; lines are sent into whichever of its chats spoke most recently.
  const groups = new Map(); // thread id -> { kind, members, chats: [] }
  for (const c of family) {
    const members = [...new Set(c.handles.split("|").map(nameOf))].sort();
    const kind = c.style === 43 ? "group" : "direct";
    const id = `${kind}-${members.join("-")}`.toLowerCase().replace(/[^a-z0-9-]+/g, "_"); // plain slug: safe in a URL
    if (!groups.has(id)) groups.set(id, { id, kind, members, name: c.name || "", chats: [] });
    const g = groups.get(id); g.chats.push(c); if (c.name && !g.name) g.name = c.name;
  }
  let msgCount = 0; const threadRows = [], msgRows = [], sendTarget = new Map();
  for (const g of groups.values()) {
    const rows = q(`select m.guid, hex(m.attributedBody) as body, m.text, m.is_from_me as me, m.is_read as read, m.date, m.cache_has_attachments as att, h.id as sender, cm.chat_id as chat,
        (select group_concat(a.mime_type, ',') from message_attachment_join ma join attachment a on a.ROWID = ma.attachment_id where ma.message_id = m.ROWID) as mimes
      from message m join chat_message_join cm on cm.message_id = m.ROWID left join handle h on h.ROWID = m.handle_id
      where cm.chat_id in (${g.chats.map((c) => c.id).join(",")}) and m.date > ${Math.floor(sinceNs)} and (m.item_type = 0 or m.item_type is null) order by m.date`);
    let last = null, lastChat = null;
    for (const m of rows) {
      const text = bodyText(m.body, m.text);
      const mime = (m.mimes || "").split(",")[0];
      const attachment = m.att ? { kind: /^image\//.test(mime) ? "photo" : /^video\//.test(mime) ? "video" : /^audio\//.test(mime) ? "audio" : "file", label: mime ? mime.split("/")[1] : "attachment" } : null;
      lastChat = m.chat;
      if (!text && !attachment) continue;
      const row = { id: m.guid, thread_id: g.id, person: PERSON, sender: m.me ? ME : nameOf(m.sender), is_me: !!m.me, at: toIso(m.date), text: text || null, attachment };
      msgRows.push(row); last = row; msgCount++;
    }
    // where a new line goes: the chat that spoke most recently, else the iMessage chat with the most messages
    const target = g.chats.find((c) => c.id === lastChat) || g.chats.filter((c) => c.guid.startsWith("iMessage")).sort((x, y) => y.n - x.n)[0] || g.chats[0];
    sendTarget.set(g.id, target.guid);
    const unread = rows.filter((m) => !m.me && !m.read).length;
    threadRows.push({ id: g.id, person: PERSON, kind: g.kind, name: g.name || g.members.filter((x) => x !== ME).join(", "), members: [ME, ...g.members.filter((x) => x !== ME)],
      last_line: last ? (last.text || `[${last.attachment?.kind}]`).slice(0, 120) : null, last_at: last?.at ?? null, unread, pending_yn: 0, mirrored: true, updated_at: now(), for_person: ME });
  }
  console.log(`${now()} ${threadRows.length} family threads (${family.length} chats in Messages), ${msgCount} messages in ${DAYS} days${DRY ? " (dry: nothing written)" : ""}`);
  if (DRY) { for (const t of threadRows) console.log(`  ${t.kind.padEnd(6)} ${t.name}  (${t.members.join(", ")})  unread ${t.unread}`); return; }

  // write (upsert; a re-run changes nothing that is already the same)
  for (let i = 0; i < threadRows.length; i += 50) await rest("POST", "messages_threads?on_conflict=id", threadRows.slice(i, i + 50), { Prefer: "resolution=merge-duplicates,return=minimal" });
  for (let i = 0; i < msgRows.length; i += 200) await rest("POST", "messages?on_conflict=id", msgRows.slice(i, i + 200), { Prefer: "resolution=merge-duplicates,return=minimal" });
  // mirror copies only: drop threads that no longer exist under these ids (renamed or no longer family) and lines past the window
  const ids = threadRows.map((t) => t.id);
  if (ids.length) {
    const inList = `(${ids.map((x) => `"${x}"`).join(",")})`;
    await rest("DELETE", `messages?person=eq.${PERSON}&thread_id=not.in.${inList}`, undefined, { Prefer: "return=minimal" });
    await rest("DELETE", `messages_threads?person=eq.${PERSON}&id=not.in.${inList}`, undefined, { Prefer: "return=minimal" });
  }
  const cutoff = new Date(Date.now() - DAYS * 86400e3).toISOString();
  await rest("DELETE", `messages?person=eq.${PERSON}&at=lt.${cutoff}`, undefined, { Prefer: "return=minimal" });

  // send what was typed on the dashboard
  const queued = await rest("GET", `messages_outbox?person=eq.${PERSON}&status=eq.queued&order=queued_at.asc&limit=20&select=id,thread_id,text`);
  let sent = 0, failed = 0;
  for (const o of queued) {
    const guid = sendTarget.get(o.thread_id);
    if (!guid) { failed++; await rest("PATCH", `messages_outbox?id=eq.${o.id}`, { status: "failed", error: "not a mirrored family thread" }, { Prefer: "return=minimal" }); continue; }
    try { sendViaMessages(guid, o.text); sent++; await rest("PATCH", `messages_outbox?id=eq.${o.id}`, { status: "sent", sent_at: now() }, { Prefer: "return=minimal" }); }
    catch (e) { failed++; await rest("PATCH", `messages_outbox?id=eq.${o.id}`, { status: "failed", error: String(e.message).slice(0, 300) }, { Prefer: "return=minimal" }); }
  }
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" }).format(new Date());
  const summary = `Messages: ${threadRows.length} family threads, ${msgCount} messages in ${DAYS} days${sent ? `, sent ${sent}` : ""}${failed ? `, ${failed} not sent` : ""} · ${time}`;
  await status(failed ? "warn" : "ok", summary);
  console.log(`${now()} ${summary}`);
}
main().catch(async (e) => { console.error(`${now()} messages-mirror: ${e.message}`); await status("error", `Messages mirror paused: ${String(e.message).slice(0, 200)}`); process.exit(1); });
