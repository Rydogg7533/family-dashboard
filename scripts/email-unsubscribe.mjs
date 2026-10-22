#!/usr/bin/env node
// Unsubscribe agent (acts on the ticks made in More › Email subscriptions). Runs on the Mac mini every 10 minutes via launchd.
// No model, no dependencies: Node 20+.
//
//   node scripts/email-unsubscribe.mjs --dry     # shows what it WOULD do for rows waiting; sends and writes nothing
//   node scripts/email-unsubscribe.mjs           # does it, then checks in (system_status key email_unsubscriber)
//
// What it does, for each row a person marked `requested` in the app:
//   - one-click sender (https, RFC 8058): sends the single standard request. Marks the row `done` ONLY when the sender answers 2xx.
//     A redirect or a refusal hands the row to the person ("open_link": open the sender's page). A busy or silent sender is retried
//     on later runs, three tries in all, then handed to the person.
//   - mailto-only sender: NEVER sends mail from the person's mailbox. The row becomes `needs_tap`; the app shows the drafted message
//     and the person sends it from their own mail app.
//   - link-only sender: `open_link`.
//   - rows waiting on the person for 21 quiet days after the request become `stopped`.
// Every outcome is written to activity_log naming who asked. The check-in (heartbeat) is what switches the Unsubscribe button on in the app.
//
// Safety rules:
//   - Unsubscribe addresses come from email headers, which anyone can forge. scripts/unsubscribe-lib.mjs refuses anything that is not
//     plain https on port 443, any private/loopback/link-local address, and enforces that at connect time. An unsafe address becomes
//     `failed` and is never shown to the person as a link.
//   - Addresses can carry a personal token: they are never printed, logged or written into notes. The terminal shows sender domains.
//   - Touches only email_subscriptions, activity_log and system_status. Never the mailbox. Never deletes anything.
//   - Just before each request the row is re-read: if the person cancelled in the meantime, nothing is sent.
//   - Secrets: ~/_secrets_local_only/family-dashboard.env (SUPABASE_URL, SUPABASE_SERVICE_KEY).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { requestOneClick, validateUnsubUrl, decideOutcome, decideManual, parseTry, shouldMarkStopped } from "./unsubscribe-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const maxArg = args.indexOf("--max");
const MAX = maxArg >= 0 ? parseInt(args[maxArg + 1], 10) : 40;
const PAUSE_MS = 1500;                                         // be polite: one request at a time, a pause between senders
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const COLS = "id,person,mailbox,sender_name,address,method,one_click,unsub_http,unsub_mailto,status_note,requested_by,requested_at";
const label = (r) => r.sender_name || r.address || "a sender";
const hostOf = (u) => { const v = validateUnsubUrl(u); return v.ok ? v.host : "(unusable address)"; };

async function heartbeat(state, summary) {
  await rest("POST", "system_status?on_conflict=key", [{ key: "email_unsubscriber", state, summary, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" });
}

async function main() {
  if (!URL || !KEY) { console.error(`SUPABASE_URL / SUPABASE_SERVICE_KEY not set (looked in ${envPath})`); process.exit(1); }
  console.log(`${DRY ? "DRY RUN (sends and writes nothing) — " : ""}unsubscribe agent`);

  const rows = await rest("GET", `email_subscriptions?status=eq.requested&deleted_at=is.null&select=${COLS}&order=requested_at.asc&limit=${MAX}`);
  const people = Object.fromEntries((await rest("GET", "profiles?select=id,display_name")).map((p) => [p.id, p.display_name]));
  const tally = { done: 0, needs_tap: 0, open_link: 0, failed: 0, retrying: 0, cancelled: 0 };
  console.log(rows.length ? `${rows.length} waiting.` : "Nothing waiting.");

  let sent = 0;
  for (const row of rows) {
    const who = people[row.requested_by] || "a household member";
    // The person may have cancelled since the list was read: look again right before acting.
    const fresh = await rest("GET", `email_subscriptions?id=eq.${row.id}&select=status`);
    if (fresh[0]?.status !== "requested") { tally.cancelled++; console.log(`  ${hostOf(row.unsub_http)}: cancelled meanwhile, skipped`); continue; }

    let plan;
    const automatic = row.method === "one_click" && row.one_click && row.unsub_http;
    if (automatic) {
      if (DRY) { console.log(`  would send one-click request to ${hostOf(row.unsub_http)} (asked by ${who})`); continue; }
      if (sent++) await sleep(PAUSE_MS);
      const result = await requestOneClick(row.unsub_http);
      plan = decideOutcome(result, { hasLink: !!(row.unsub_http && validateUnsubUrl(row.unsub_http).ok), tries: parseTry(row.status_note) });
    } else {
      plan = decideManual(row);
      if (DRY) { console.log(`  ${row.method}: would mark ${plan.status} for ${label(row)} (asked by ${who})`); continue; }
    }

    const now = new Date().toISOString();
    const patch = { status: plan.status, status_note: plan.note, updated_at: now, ...(plan.completed ? { completed_at: now } : {}) };
    // Only if it is still 'requested': a cancel that arrived during the request wins the row (the request itself cannot be recalled).
    const wrote = await rest("PATCH", `email_subscriptions?id=eq.${row.id}&status=eq.requested`, patch, { Prefer: "return=representation" });
    if (!wrote?.length) { tally.cancelled++; console.log(`  ${hostOf(row.unsub_http)}: row changed while working; left as is`); continue; }
    if (plan.status === "requested") tally.retrying++; else tally[plan.status]++;
    console.log(`  ${row.address ? row.address.split("@")[1] : "sender"}: ${plan.status}`);
    if (plan.status !== "requested") {
      const verb = { done: "unsubscribed from", needs_tap: "needs a tap to unsubscribe from", open_link: "needs the person to finish unsubscribing from", failed: "could not unsubscribe from" }[plan.status];
      await rest("POST", "activity_log", { actor: "email-unsubscriber", action: `email_unsubscribe_${plan.status}`, subject: `Asked by ${who}: ${verb} ${label(row)}`.slice(0, 200), ref: row.id, undoable: false }).catch(() => {});
    }
  }

  // Rows waiting on the person that have gone quiet for 21 days.
  let stopped = 0;
  const cutoff = new Date(Date.now() - 21 * 86400000).toISOString();
  const waiting = await rest("GET", `email_subscriptions?status=in.(needs_tap,open_link)&deleted_at=is.null&requested_at=lt.${encodeURIComponent(cutoff)}&select=id,status,requested_at,last_seen,sender_name,address,requested_by`);
  for (const r of waiting) {
    if (!shouldMarkStopped(r)) continue;
    if (DRY) { console.log(`  would mark stopped: ${label(r)}`); stopped++; continue; }
    const w = await rest("PATCH", `email_subscriptions?id=eq.${r.id}&status=in.(needs_tap,open_link)`, { status: "stopped", status_note: "No emails for 3 weeks after you asked.", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { Prefer: "return=representation" });
    if (w?.length) { stopped++; await rest("POST", "activity_log", { actor: "email-unsubscriber", action: "email_unsubscribe_stopped", subject: `Asked by ${people[r.requested_by] || "a household member"}: ${label(r)} has stopped sending`.slice(0, 200), ref: r.id, undoable: false }).catch(() => {}); }
  }

  const parts = [`${tally.done} done`, `${tally.needs_tap + tally.open_link} need you`, `${tally.retrying} retrying`];
  if (tally.failed) parts.push(`${tally.failed} failed`);
  if (stopped) parts.push(`${stopped} stopped sending`);
  const summary = `Unsubscribe agent: ${rows.length - tally.cancelled} handled (${parts.join(", ")})`;
  if (DRY) { console.log(`\nDRY RUN: nothing sent, nothing written.\n${summary}`); return; }
  await heartbeat(tally.failed ? "warn" : "ok", summary);
  console.log(`\nPASS — ${summary}`);
}

main().catch(async (e) => {
  console.error(`FAILED: ${e.message}`);
  if (!DRY && URL && KEY) await heartbeat("error", `Unsubscribe agent: ${String(e.message).slice(0, 150)}`).catch(() => {});
  process.exit(1);
});
