#!/usr/bin/env node
// Mailing-list scanner (feeds More › Email subscriptions). Runs on the Mac mini. No model, no dependencies: Node 20+.
//
//   node scripts/email-subscriptions.mjs --account rross15253@gmail.com --days 365 --dry   # first look, writes nothing
//   node scripts/email-subscriptions.mjs --account rross15253@gmail.com --days 365         # first fill (backfill)
//   node scripts/email-subscriptions.mjs --account rross15253@gmail.com --days 3           # what launchd runs every 3 hours
//
// What it does: finds messages that carry a List-Unsubscribe header, reads only HEADERS (From, List-Id, List-Unsubscribe,
// List-Unsubscribe-Post, date), groups them by sender, and fills public.email_subscriptions (migrations 0016, 0017).
//
// Safety rules:
//   - READ-ONLY on the mailbox: the Gmail session is opened with allowWrite:false (scripts/email-lib.mjs), so any non-GET call
//     throws. It never reads message bodies, subjects or snippets, and never sends, labels, archives or deletes anything.
//   - Writes only to email_subscriptions and one system_status line. It never changes a row's status, status_note, requested_*,
//     completed_at or deleted_at: the person (through the app) and the unsubscribe agent own those. Nothing is ever deleted.
//   - Counts are exact: a cursor (last_message_ts) means overlapping scans never count a message twice. Mail arriving after a
//     completed unsubscribe is counted in messages_since_unsub, which is how "did it really stop?" gets checked.
//   - Unsubscribe links can carry a per-person token, so they are stored only in the household's own Supabase project (RLS: the
//     mailbox owner reads them) and never printed. The terminal shows counts and sender domains only.
//   - Sign-in: the saved token and OAuth client in ~/_secrets_local_only/email-agent/ (see scripts/google-auth.mjs).
//   - Secrets: ~/_secrets_local_only/family-dashboard.env (SUPABASE_URL, SUPABASE_SERVICE_KEY).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { die, option, openGmail, sleep } from "./email-lib.mjs";
import { parseMessage, groupSenders, planWrites } from "./subscriptions-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const days = parseInt(option(args, "--days") || "365", 10);
const MAX = parseInt(option(args, "--max") || "20000", 10);
const personName = option(args, "--person") || "Ryan";
const WORKERS = 3;
const { account, api } = openGmail(args, { allowWrite: false });     // read-only: any non-GET call throws
const query = option(args, "--q") || `newer_than:${days}d -in:spam -in:trash -in:chats -from:me unsubscribe`;

// ---------- env + PostgREST (same pattern as contacts-sync.mjs) ----------
const envPath = join(homedir(), "_secrets_local_only", "family-dashboard.env");
const env = {};
try { for (const line of readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---------- read the mailbox (headers only) ----------
async function listIds() {
  const ids = []; let page = "";
  do {
    const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=500${page ? `&pageToken=${page}` : ""}`);
    for (const m of r.messages || []) if (ids.length < MAX) ids.push(m.id);
    page = ids.length >= MAX ? "" : r.nextPageToken || "";
  } while (page);
  return ids;
}

async function readAll(ids) {
  const hdrs = ["From", "List-Id", "List-Unsubscribe", "List-Unsubscribe-Post"].map((x) => `metadataHeaders=${x}`).join("&");
  const fields = encodeURIComponent("id,internalDate,payload/headers");           // no snippet, no subject, no body
  const records = []; const failed = []; let next = 0, done = 0; const t0 = Date.now();
  const readOne = async (id) => { const r = parseMessage(await api(`/gmail/v1/users/me/messages/${id}?format=metadata&${hdrs}&fields=${fields}`)); if (r) records.push(r); };
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    for (;;) {
      const i = next++; if (i >= ids.length) return;
      try { await readOne(ids[i]); } catch { failed.push(ids[i]); }
      if (++done % 500 === 0) console.log(`  ${done}/${ids.length} read · ${Math.round(done / ((Date.now() - t0) / 60000))}/min`);
    }
  }));
  let unreadable = 0;
  if (failed.length) {
    console.log(`  ${failed.length} messages hit Gmail's rate limit; pausing 30s, then retrying them one at a time.`);
    await sleep(30000);
    for (const id of failed) { try { await readOne(id); } catch { unreadable++; await sleep(2000); } }
  }
  return { records, unreadable };
}

// ---------- main ----------
async function main() {
  if (!DRY && (!URL || !KEY)) die(`SUPABASE_URL / SUPABASE_SERVICE_KEY not set (looked in ${envPath})`);
  console.log(`${DRY ? "DRY RUN (writes nothing) — " : ""}${account} — last ${days} days — headers only, read-only`);
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);

  const ids = await listIds();
  console.log(`${ids.length} candidate messages${ids.length >= MAX ? ` (capped at ${MAX}; raise --max to read more)` : ""}.`);
  const { records, unreadable } = await readAll(ids);
  const groups = groupSenders(records);

  const byMethod = {}; for (const g of groups.values()) byMethod[g.method] = (byMethod[g.method] || 0) + 1;
  const byDomain = new Map(); for (const g of groups.values()) byDomain.set(g.domain, (byDomain.get(g.domain) || 0) + g.ts.length);
  console.log(`\n${records.length} messages carry a List-Unsubscribe header, from ${groups.size} senders.`);
  console.log(`How each can be unsubscribed: ${Object.entries(byMethod).map(([m, n]) => `${n} ${m}`).join(" · ") || "none"}`);
  console.log("Busiest sender domains:");
  for (const [d, n] of [...byDomain].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(5)}  ${d}`);
  if (unreadable) console.log(`\n${unreadable} messages could not be read this run; they are picked up by the next run.`);
  if (DRY) { console.log("\nDRY RUN: nothing written."); return; }

  const people = await rest("GET", `profiles?select=id,display_name&display_name=ilike.${encodeURIComponent(personName)}`);
  if (!people.length) die(`no profile named ${personName}`);
  const person = people[0].id;
  const existing = new Map();
  for (let from = 0; ; from += 1000) {
    const page = await rest("GET", `email_subscriptions?person=eq.${person}&mailbox=eq.${encodeURIComponent(account)}&select=id,sender_key,message_count,last_message_ts,first_seen,deleted_at,completed_at,messages_since_unsub`, undefined, { Range: `${from}-${from + 999}` });
    for (const r of page) existing.set(r.sender_key, r);
    if (page.length < 1000) break;
  }
  const { inserts, updates } = planWrites({ groups, existing, person, mailbox: account, now: new Date().toISOString() });
  for (let i = 0; i < inserts.length; i += 200) await rest("POST", "email_subscriptions?on_conflict=person,mailbox,sender_key", inserts.slice(i, i + 200), { Prefer: "resolution=merge-duplicates,return=minimal" });
  for (const u of updates) await rest("PATCH", `email_subscriptions?id=eq.${u.id}`, u.patch, { Prefer: "return=minimal" });

  const summary = `Email subscriptions (${account}): ${groups.size} senders found, ${inserts.length} new, ${updates.length} updated${unreadable ? `, ${unreadable} unread` : ""}`;
  await rest("POST", "system_status?on_conflict=key", [{ key: "email_subscriptions", state: unreadable ? "warn" : "ok", summary, value_num: groups.size, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`\nPASS — ${inserts.length} new, ${updates.length} updated. Mailbox untouched.`);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
