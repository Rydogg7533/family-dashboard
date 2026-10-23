#!/usr/bin/env node
// Mac mini → app Mail, iCloud account (read-only Inbox + Drafts), same tables as mail-sync.mjs (kind 'icloud').
//   node scripts/icloud-mail-sync.mjs --dry     # look only: counts, writes nothing
//   node scripts/icloud-mail-sync.mjs           # what launchd runs every 5 minutes
//   node scripts/icloud-mail-sync.mjs --person Ryan --env ~/_secrets_local_only/email-agent/icloud-ryan.env
// Safety: folders are opened read-only (EXAMINE) and bodies fetched with BODY.PEEK, so nothing is marked read, moved, flagged
// or deleted; there is no code path that writes to the mailbox. Mail that leaves the inbox is marked left_inbox_at in the
// database, never deleted. Message text is stored as plain text only (HTML flattened), in the household's own Supabase project.
// Credentials: ICLOUD_MAIL_USER and ICLOUD_MAIL_APP_PASSWORD (an app-specific password, never the Apple ID password) in
// ~/_secrets_local_only/email-agent/icloud-ryan.env. The password is never printed.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlToText, parseAddress, parseAddressList } from "./mail-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const MAX = parseInt(opt("--max") || "300", 10);
const personName = opt("--person") || "Ryan";
const MAX_SOURCE = 15 * 1024 * 1024; // bigger messages are listed without a body rather than pulled into memory

const readEnv = (p) => { const o = {}; if (!existsSync(p)) return o; for (const line of readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return o; };
const appEnv = readEnv(join(homedir(), "_secrets_local_only", "family-dashboard.env"));
const mailEnvPath = (opt("--env") || join(homedir(), "_secrets_local_only", "email-agent", "icloud-ryan.env")).replace(/^~/, homedir());
const mailEnv = readEnv(mailEnvPath);
const URL_ = appEnv.SUPABASE_URL || appEnv.NEXT_PUBLIC_SUPABASE_URL, KEY = appEnv.SUPABASE_SERVICE_KEY || appEnv.SUPABASE_SERVICE_ROLE_KEY;
const USER = mailEnv.ICLOUD_MAIL_USER, PASS = mailEnv.ICLOUD_MAIL_APP_PASSWORD;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const now = () => new Date().toISOString();

async function toRow(m, folder, uidv) {
  const base = { ext_id: `${uidv}-${m.uid}`, thread_id: null, folder, unread: folder === "inbox" ? !m.flags?.has("\\Seen") : false, web_url: null };
  if (!m.source || (m.size ?? 0) > MAX_SOURCE) {
    const e = m.envelope || {};
    return { ...base, rfc_message_id: (e.messageId || "").replace(/^<|>$/g, "").slice(0, 300) || null, from_name: e.from?.[0]?.name || null, from_addr: (e.from?.[0]?.address || "").toLowerCase() || null,
      to_addrs: (e.to || []).map((x) => ({ name: x.name || "", addr: (x.address || "").toLowerCase() })), cc_addrs: (e.cc || []).map((x) => ({ name: x.name || "", addr: (x.address || "").toLowerCase() })),
      subject: (e.subject || "").slice(0, 500), snippet: "(large message: body not copied)", body_text: "", sent_at: (e.date || m.internalDate) ? new Date(e.date || m.internalDate).toISOString() : null, attachments: [] };
  }
  const p = await simpleParser(m.source);
  const from = p.from?.value?.[0] || {};
  let text = (p.text || "").trim(); if (!text && p.html) text = htmlToText(p.html);
  text = text.replace(/\r\n/g, "\n").slice(0, 200000);
  const list = (f) => (f?.value || []).map((x) => ({ name: x.name || "", addr: (x.address || "").toLowerCase() }));
  const d = p.date || m.internalDate;
  return { ...base, rfc_message_id: (p.messageId || "").replace(/^<|>$/g, "").slice(0, 300) || null, from_name: from.name || null, from_addr: (from.address || "").toLowerCase() || null,
    to_addrs: list(p.to), cc_addrs: list(p.cc), subject: (p.subject || "").slice(0, 500), snippet: text.replace(/\s+/g, " ").slice(0, 300), body_text: text,
    sent_at: d ? new Date(d).toISOString() : null, attachments: (p.attachments || []).slice(0, 20).map((a) => ({ name: a.filename || "attachment", mime: a.contentType || "", size: a.size || 0 })) };
}

// One folder: returns [count, newCount, leftCount, readFlips].
async function syncFolder(c, path, folder, acct, person) {
  const lock = await c.getMailboxLock(path, { readOnly: true });
  try {
    const uidv = String(c.mailbox.uidValidity);
    const all = c.mailbox.exists ? await c.search({ all: true }, { uid: true }) : [];
    const uids = all.slice(-MAX);
    const state = new Map(); // ext_id -> unread
    if (uids.length) for await (const m of c.fetch(uids.join(","), { uid: true, flags: true }, { uid: true })) state.set(`${uidv}-${m.uid}`, folder === "inbox" ? !m.flags.has("\\Seen") : false);
    const have = DRY ? [] : await rest("GET", `mail_messages?account_id=eq.${acct}&folder=eq.${folder}&left_inbox_at=is.null&select=id,ext_id,unread&limit=2000`);
    const haveMap = new Map(have.map((r) => [r.ext_id, r]));
    const fresh = uids.filter((u) => !haveMap.has(`${uidv}-${u}`));
    const rows = [];
    for (const g of chunks(fresh, 20)) {
      for await (const m of c.fetch(g.join(","), { uid: true, flags: true, size: true, envelope: true, internalDate: true, source: true }, { uid: true })) rows.push(await toRow(m, folder, uidv));
    }
    let flips = 0, left = 0;
    if (!DRY) {
      for (const g of chunks(rows, 50)) await rest("POST", "mail_messages?on_conflict=account_id,folder,ext_id", g.map((p) => ({ ...p, account_id: acct, person, left_inbox_at: null, synced_at: now() })), { Prefer: "resolution=merge-duplicates,return=minimal" });
      for (const r of have) { const u = state.get(r.ext_id); if (u !== undefined && u !== r.unread) { await rest("PATCH", `mail_messages?id=eq.${r.id}`, { unread: u }, { Prefer: "return=minimal" }); flips++; } }
      const gone = have.filter((r) => !state.has(r.ext_id)); left = gone.length;
      for (const g of chunks(gone, 100)) await rest("PATCH", `mail_messages?id=in.(${g.map((r) => r.id).join(",")})`, { left_inbox_at: now() }, { Prefer: "return=minimal" });
    }
    return [uids.length, fresh.length, left, flips];
  } finally { lock.release(); }
}

async function main() {
  if (!URL_ || !KEY) { console.error("STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY missing from ~/_secrets_local_only/family-dashboard.env"); process.exit(1); }
  if (!USER || !PASS) { console.error(`STOP: ICLOUD_MAIL_USER / ICLOUD_MAIL_APP_PASSWORD not found in ${mailEnvPath}`); process.exit(1); }
  const person = (await rest("GET", `profiles?display_name=ilike.${encodeURIComponent(personName)}&select=id`))[0]?.id;
  if (!person) { console.error(`STOP: no profile named ${personName}`); process.exit(1); }
  const acct = DRY ? "dry" : (await rest("POST", "mail_accounts?on_conflict=person,address", [{ person, address: USER, kind: "icloud" }], { Prefer: "resolution=merge-duplicates,return=representation" }))[0].id;
  const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
  let line, state = "ok";
  try {
    await c.connect();
    const boxes = await c.list();
    const drafts = boxes.find((b) => b.specialUse === "\\Drafts")?.path;
    const [n, fresh, left, flips] = await syncFolder(c, "INBOX", "inbox", acct, person);
    let d = [0, 0, 0, 0]; if (drafts) d = await syncFolder(c, drafts, "draft", acct, person);
    line = `${USER}: inbox ${n} (${fresh} new, ${left} left, ${flips} read-state changes), drafts ${d[0]}`;
    if (!DRY) await rest("PATCH", `mail_accounts?id=eq.${acct}`, { last_sync_at: now(), last_error: null }, { Prefer: "return=minimal" });
  } catch (e) {
    state = "error"; const msg = String(e.responseText || e.message || e).slice(0, 300);
    line = `${USER}: ERROR ${msg}`;
    if (!DRY) await rest("PATCH", `mail_accounts?id=eq.${acct}`, { last_error: msg }, { Prefer: "return=minimal" }).catch(() => {});
  } finally { try { await c.logout(); } catch { /* already closed */ } }
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "mail_sync_icloud", state, summary: `iCloud mail: ${line}`, value_num: null, updated_at: now() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${now()} ${DRY ? "(dry) " : ""}${line}`);
  if (state === "error") process.exit(1);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
