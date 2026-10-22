#!/usr/bin/env node
// Mac mini → app Mail (stage 1: read-only Inbox + Drafts). Node 20+, no dependencies.
//   node scripts/mail-sync.mjs --dry            # look only, write nothing
//   node scripts/mail-sync.mjs                  # sync every saved Google account (what launchd runs every 5 minutes)
//   node scripts/mail-sync.mjs --account a@b.com --person Ryan
// Safety: the Gmail session is opened with allowWrite:false, so any non-GET call throws. It cannot send, label, archive or
// delete. Mail that leaves the inbox is marked left_inbox_at in the database, never deleted. Message text is stored as
// plain text only (HTML is flattened), in the household's own Supabase project, readable only by the mailbox owner.
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { openGmail, option, dir } from "./email-lib.mjs";
import { parseGmailFull } from "./mail-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const MAX = parseInt(option(args, "--max") || "300", 10);
const personName = option(args, "--person") || "Ryan";

const envPath = join(homedir(), "_secrets_local_only", "family-dashboard.env");
const env = {};
try { for (const line of readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function syncAccount(account, person, log) {
  const { api } = openGmail(["--account", account], { allowWrite: false });
  const rows = DRY ? [{ id: "dry" }] : await rest("POST", "mail_accounts?on_conflict=person,address", [{ person, address: account, kind: "gmail" }], { Prefer: "resolution=merge-duplicates,return=representation" });
  const acct = rows[0].id;
  // ---- inbox ----
  const ids = []; let page = "";
  do { const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent("in:inbox")}&maxResults=100${page ? `&pageToken=${page}` : ""}`); for (const m of r.messages || []) if (ids.length < MAX) ids.push(m.id); page = ids.length >= MAX ? "" : r.nextPageToken || ""; } while (page);
  const unreadSet = new Set(); page = "";
  do { const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent("in:inbox is:unread")}&maxResults=100${page ? `&pageToken=${page}` : ""}`); for (const m of r.messages || []) unreadSet.add(m.id); page = r.nextPageToken || ""; } while (page);
  const have = DRY ? [] : await rest("GET", `mail_messages?account_id=eq.${acct}&folder=eq.inbox&left_inbox_at=is.null&select=id,ext_id,unread&limit=2000`);
  const haveMap = new Map(have.map((r) => [r.ext_id, r]));
  const fresh = ids.filter((i) => !haveMap.has(i));
  const parsed = [];
  for (const group of chunks(fresh, 5)) for (const m of await Promise.all(group.map((id) => api(`/gmail/v1/users/me/messages/${id}?format=full`)))) parsed.push({ ...parseGmailFull(m, "inbox", account), unread: unreadSet.has(m.id) });
  let readFlips = 0;
  if (!DRY) {
    for (const g of chunks(parsed, 100)) await rest("POST", "mail_messages?on_conflict=account_id,folder,ext_id", g.map((p) => ({ ...p, account_id: acct, person, left_inbox_at: null, synced_at: new Date().toISOString() })), { Prefer: "resolution=merge-duplicates,return=minimal" });
    for (const r of have) { const u = unreadSet.has(r.ext_id); if (ids.includes(r.ext_id) && u !== r.unread) { await rest("PATCH", `mail_messages?id=eq.${r.id}`, { unread: u }, { Prefer: "return=minimal" }); readFlips++; } }
    const idSet = new Set(ids); const gone = have.filter((r) => !idSet.has(r.ext_id));
    for (const g of chunks(gone, 100)) await rest("PATCH", `mail_messages?id=in.(${g.map((r) => r.id).join(",")})`, { left_inbox_at: new Date().toISOString() }, { Prefer: "return=minimal" });
    var left = gone.length;
  } else var left = 0;
  // ---- drafts ----
  const dl = await api("/gmail/v1/users/me/drafts?maxResults=100"); const dIds = (dl.drafts || []).map((d) => d.id);
  const dParsed = [];
  for (const group of chunks(dIds, 5)) for (const d of await Promise.all(group.map((id) => api(`/gmail/v1/users/me/drafts/${id}?format=full`)))) dParsed.push({ ...parseGmailFull(d.message, "draft", account), ext_id: d.id, unread: false });
  let dGone = 0;
  if (!DRY) {
    for (const g of chunks(dParsed, 50)) await rest("POST", "mail_messages?on_conflict=account_id,folder,ext_id", g.map((p) => ({ ...p, account_id: acct, person, left_inbox_at: null, synced_at: new Date().toISOString() })), { Prefer: "resolution=merge-duplicates,return=minimal" });
    const dHave = await rest("GET", `mail_messages?account_id=eq.${acct}&folder=eq.draft&left_inbox_at=is.null&select=id,ext_id&limit=1000`);
    const dSet = new Set(dIds); const gone = dHave.filter((r) => !dSet.has(r.ext_id)); dGone = gone.length;
    for (const g of chunks(gone, 100)) await rest("PATCH", `mail_messages?id=in.(${g.map((r) => r.id).join(",")})`, { left_inbox_at: new Date().toISOString() }, { Prefer: "return=minimal" });
    await rest("PATCH", `mail_accounts?id=eq.${acct}`, { last_sync_at: new Date().toISOString(), last_error: null }, { Prefer: "return=minimal" });
  }
  log.push(`${account}: inbox ${ids.length} (${fresh.length} new, ${left} left, ${readFlips} read-state changes), drafts ${dIds.length}${dGone ? ` (${dGone} gone)` : ""}`);
}

async function main() {
  if (!URL_ || !KEY) { console.error(`SUPABASE_URL / SUPABASE_SERVICE_KEY not set (looked in ${envPath})`); process.exit(1); }
  const named = option(args, "--account");
  const accounts = named ? [named] : readdirSync(dir).map((f) => f.match(/^google-(.+@.+)\.json$/)?.[1]).filter(Boolean);
  if (!accounts.length) { console.error(`no saved Google sign-ins in ${dir}`); process.exit(1); }
  const person = DRY ? "dry" : (await rest("GET", `profiles?display_name=ilike.${encodeURIComponent(personName)}&select=id`))[0]?.id;
  if (!person) { console.error(`no profile named ${personName}`); process.exit(1); }
  const log = []; let state = "ok";
  for (const a of accounts) {
    try { await syncAccount(a, person, log); }
    catch (e) { state = "error"; log.push(`${a}: ERROR ${e.message}`); if (!DRY) await rest("PATCH", `mail_accounts?person=eq.${person}&address=eq.${encodeURIComponent(a)}`, { last_error: String(e.message).slice(0, 300) }, { Prefer: "return=minimal" }).catch(() => {}); }
  }
  const summary = log.join("; ");
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "mail_sync", state, summary: `Mail: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${new Date().toISOString()} ${DRY ? "(dry) " : ""}${summary}`);
  if (state === "error") process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
