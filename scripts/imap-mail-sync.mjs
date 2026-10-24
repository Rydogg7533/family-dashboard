#!/usr/bin/env node
// Mac mini → app Mail over IMAP, any provider (D75). Read-only Inbox + Drafts into the same tables as the other mail syncs.
//   node scripts/imap-mail-sync.mjs --dry                 # look only: counts per account, writes nothing
//   node scripts/imap-mail-sync.mjs                       # what launchd runs every 5 minutes: every imap-*.env in the secrets folder
//   node scripts/imap-mail-sync.mjs --account a@b.com     # one account
//
// One file per mailbox, written by scripts/mail-connect.mjs:  ~/_secrets_local_only/email-agent/imap-<address>.env
//   MAIL_PROVIDER=gmail|icloud|other   MAIL_HOST=imap.gmail.com   MAIL_PORT=993   MAIL_USER=<address>
//   MAIL_APP_PASSWORD=<app-specific password, never the account password>   MAIL_PERSON=<display name, whose mailbox this is>
// Safety: folders are opened read-only (EXAMINE) and bodies fetched with BODY.PEEK, so nothing is marked read, moved, flagged or deleted;
// there is no code path that writes to the mailbox. Mail that leaves the inbox is marked left_inbox_at here, never deleted. Plain text only.
// The password is never printed. A mailbox that is also signed in through the Gmail API (google-<address>.json) is skipped unless --dry,
// so one mailbox is never copied twice under two ids.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlToText } from "./mail-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const MAX = parseInt(opt("--max") || "300", 10);
const ONLY = opt("--account")?.toLowerCase();
const MAX_SOURCE = 15 * 1024 * 1024;

export const SECRETS = join(homedir(), "_secrets_local_only");
export const EMAIL_DIR = join(SECRETS, "email-agent");
export const PROVIDERS = {
  gmail: { host: "imap.gmail.com", port: 993, label: "Gmail", note: "Needs 2-Step Verification on the Google account, then an App password (Google Account › Security › 2-Step Verification › App passwords). IMAP must be on in Gmail settings (it is, by default, for most accounts)." },
  icloud: { host: "imap.mail.me.com", port: 993, label: "iCloud Mail", note: "Needs an app-specific password (appleid.apple.com › Sign-In and Security › App-Specific Passwords)." },
  other: { host: null, port: 993, label: "Other (IMAP)", note: "Any mail service that offers IMAP with an app password. Outlook.com no longer allows passwords over IMAP (unverified for Microsoft 365)." },
};
export const readEnv = (p) => { const o = {}; if (!existsSync(p)) return o; for (const line of readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return o; };
export const imapEnvFiles = () => (existsSync(EMAIL_DIR) ? readdirSync(EMAIL_DIR).filter((f) => /^imap-.+@.+\.env$/.test(f)) : []);
export const apiTokenExists = (address) => existsSync(join(EMAIL_DIR, `google-${address}.json`));

const appEnv = readEnv(join(SECRETS, "family-dashboard.env"));
const URL_ = appEnv.SUPABASE_URL || appEnv.NEXT_PUBLIC_SUPABASE_URL, KEY = appEnv.SUPABASE_SERVICE_KEY || appEnv.SUPABASE_SERVICE_ROLE_KEY;
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
  const addr = (x) => ({ name: x.name || "", addr: (x.address || "").toLowerCase() });
  if (!m.source || (m.size ?? 0) > MAX_SOURCE) {
    const e = m.envelope || {};
    return { ...base, rfc_message_id: (e.messageId || "").replace(/^<|>$/g, "").slice(0, 300) || null, from_name: e.from?.[0]?.name || null, from_addr: (e.from?.[0]?.address || "").toLowerCase() || null,
      to_addrs: (e.to || []).map(addr), cc_addrs: (e.cc || []).map(addr), subject: (e.subject || "").slice(0, 500), snippet: "(large message: body not copied)", body_text: "",
      sent_at: (e.date || m.internalDate) ? new Date(e.date || m.internalDate).toISOString() : null, attachments: [] };
  }
  const p = await simpleParser(m.source);
  const from = p.from?.value?.[0] || {};
  let text = (p.text || "").trim(); if (!text && p.html) text = htmlToText(p.html);
  text = text.replace(/\r\n/g, "\n").slice(0, 200000);
  const list = (f) => (f?.value || []).map(addr);
  const d = p.date || m.internalDate;
  return { ...base, rfc_message_id: (p.messageId || "").replace(/^<|>$/g, "").slice(0, 300) || null, from_name: from.name || null, from_addr: (from.address || "").toLowerCase() || null,
    to_addrs: list(p.to), cc_addrs: list(p.cc), subject: (p.subject || "").slice(0, 500), snippet: text.replace(/\s+/g, " ").slice(0, 300), body_text: text,
    sent_at: d ? new Date(d).toISOString() : null, attachments: (p.attachments || []).slice(0, 20).map((a) => ({ name: a.filename || "attachment", mime: a.contentType || "", size: a.size || 0 })) };
}

// One folder, read-only. Returns [count, newCount, leftCount, readFlips].
async function syncFolder(c, path, folder, acct, person) {
  const lock = await c.getMailboxLock(path, { readOnly: true });
  try {
    const uidv = String(c.mailbox.uidValidity);
    const all = c.mailbox.exists ? await c.search({ all: true }, { uid: true }) : [];
    const uids = all.slice(-MAX);
    const state = new Map();
    if (uids.length) for await (const m of c.fetch(uids.join(","), { uid: true, flags: true }, { uid: true })) state.set(`${uidv}-${m.uid}`, folder === "inbox" ? !m.flags.has("\\Seen") : false);
    const have = DRY ? [] : await rest("GET", `mail_messages?account_id=eq.${acct}&folder=eq.${folder}&left_inbox_at=is.null&select=id,ext_id,unread&limit=2000`);
    const haveMap = new Map(have.map((r) => [r.ext_id, r]));
    const fresh = uids.filter((u) => !haveMap.has(`${uidv}-${u}`));
    const rows = [];
    if (!DRY) for (const g of chunks(fresh, 20)) for await (const m of c.fetch(g.join(","), { uid: true, flags: true, size: true, envelope: true, internalDate: true, source: true }, { uid: true })) rows.push(await toRow(m, folder, uidv));
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

// Opens one mailbox read-only and returns its folders (used by mail-connect.mjs to test a new sign-in). Never prints the password.
export async function probe(cfg) {
  const c = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  await c.connect();
  try {
    const boxes = await c.list();
    const lock = await c.getMailboxLock("INBOX", { readOnly: true });
    const inbox = c.mailbox.exists; lock.release();
    return { folders: boxes.map((b) => b.path), drafts: boxes.find((b) => b.specialUse === "\\Drafts")?.path || null, inbox };
  } finally { try { await c.logout(); } catch { /* closed */ } }
}

async function syncOne(file, log) {
  const e = readEnv(join(EMAIL_DIR, file));
  const prov = PROVIDERS[e.MAIL_PROVIDER] || PROVIDERS.other;
  const host = e.MAIL_HOST || prov.host, port = parseInt(e.MAIL_PORT || String(prov.port), 10);
  const user = (e.MAIL_USER || "").toLowerCase(), pass = e.MAIL_APP_PASSWORD, personName = e.MAIL_PERSON;
  if (!host || !user || !pass || !personName) { log.push(`${file}: SKIPPED, needs MAIL_HOST (or a known MAIL_PROVIDER), MAIL_USER, MAIL_APP_PASSWORD, MAIL_PERSON`); return "error"; }
  if (!DRY && apiTokenExists(user)) { log.push(`${user}: SKIPPED, also signed in through the Gmail API (google-${user}.json); keep one or the other`); return "ok"; }
  let acct = "dry", person = "dry";
  if (!DRY) {
    person = (await rest("GET", `profiles?display_name=ilike.${encodeURIComponent(personName)}&select=id`))[0]?.id;
    if (!person) { log.push(`${user}: SKIPPED, no profile named ${personName}`); return "error"; }
    const owned = (await rest("GET", `mail_accounts?address=eq.${encodeURIComponent(user)}&select=person`))[0];
    if (owned && owned.person !== person) { log.push(`${user}: STOPPED, this mailbox already belongs to someone else`); return "error"; }
    acct = (await rest("POST", "mail_accounts?on_conflict=person,address", [{ person, address: user, kind: e.MAIL_PROVIDER === "icloud" ? "icloud" : e.MAIL_PROVIDER === "gmail" ? "gmail" : "other" }], { Prefer: "resolution=merge-duplicates,return=representation" }))[0].id;
  }
  const c = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
  try {
    await c.connect();
    const boxes = await c.list();
    const drafts = boxes.find((b) => b.specialUse === "\\Drafts")?.path;
    const [n, fresh, left, flips] = await syncFolder(c, "INBOX", "inbox", acct, person);
    let d = [0, 0, 0, 0]; if (drafts) d = await syncFolder(c, drafts, "draft", acct, person);
    log.push(`${user}: inbox ${n} (${fresh} new, ${left} left, ${flips} read-state changes), drafts ${d[0]}`);
    if (!DRY) await rest("PATCH", `mail_accounts?id=eq.${acct}`, { last_sync_at: now(), last_error: null }, { Prefer: "return=minimal" });
    return "ok";
  } catch (err) {
    const msg = String(err.responseText || err.message || err).slice(0, 300);
    log.push(`${user}: ERROR ${msg}`);
    if (!DRY) await rest("PATCH", `mail_accounts?id=eq.${acct}`, { last_error: msg }, { Prefer: "return=minimal" }).catch(() => {});
    return "error";
  } finally { try { await c.logout(); } catch { /* closed */ } }
}

async function main() {
  if (!URL_ || !KEY) { console.error("STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY missing from ~/_secrets_local_only/family-dashboard.env"); process.exit(1); }
  let files = imapEnvFiles();
  if (ONLY) files = files.filter((f) => f.toLowerCase() === `imap-${ONLY}.env`);
  if (!files.length) { console.error(`no IMAP mailboxes${ONLY ? ` for ${ONLY}` : ""} in ${EMAIL_DIR} (set one up: node scripts/mail-connect.mjs)`); process.exit(1); }
  const log = []; let state = "ok";
  for (const f of files) if ((await syncOne(f, log)) === "error") state = "error";
  const summary = log.join("; ");
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "mail_sync_imap", state, summary: `Mail (IMAP): ${summary}`, value_num: null, updated_at: now() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${now()} ${DRY ? "(dry) " : ""}${summary}`);
  if (state === "error") process.exit(1);
}
if (process.argv[1] && process.argv[1].endsWith("imap-mail-sync.mjs")) main().catch((e) => { console.error(e.message || e); process.exit(1); });
