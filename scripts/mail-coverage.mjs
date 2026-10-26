#!/usr/bin/env node
// How much of every mailbox the FREE rules already place, across all saved Google sign-ins at once. Node 20+.
//
//   node scripts/mail-coverage.mjs                 # every saved mailbox, inbox, last 90 days
//   node scripts/mail-coverage.mjs --days 365      # a wider window
//   node scripts/mail-coverage.mjs --account a@b.com   # just one
//
// Why this exists: scripts/email-scan.mjs already reports this for ONE mailbox. Nobody had ever run it across
// all of them, so "how much does the free funnel actually catch, and how much would reach the model" was a
// guess. This is the measurement, and it is the same account-enumeration triage needs in order to run over
// every mailbox instead of one named on the command line (decisions log 2026-10-26, D108).
//
// Safety rules:
//   - READ-ONLY. Every session is opened with allowWrite:false, so any non-GET Gmail call throws. Nothing is
//     labelled, archived, moved, trashed, drafted or sent, and nothing is written to the database.
//   - NO MODEL. Nothing is sent to Anthropic or anywhere else. Mail the free rules cannot place is counted
//     as "needs a person" and left alone.
//   - The terminal shows COUNTS and sender DOMAINS only — never a subject, never an address, never a snippet.
//   - Tokens are read from ~/_secrets_local_only/email-agent/google-<account>.json and never printed.
//   - Headers read per message: From, Subject, List-Unsubscribe, Precedence, Auto-Submitted, plus Gmail's own
//     category labels. Never the body, never attachments.
import { readdirSync } from "node:fs";
import { openGmail, option, readMessages, dir } from "./email-lib.mjs";
import { isMailboxToken } from "./mail-sync.mjs";

const args = process.argv.slice(2);
const days = parseInt(option(args, "--days") || "90", 10);
const MAX = parseInt(option(args, "--max") || "5000", 10);
const named = option(args, "--account");
const query = option(args, "--q") || `in:inbox newer_than:${days}d`;

// What each action means in plain words, so the table reads without the source open.
const MEANING = {
  skip: "already in a Gmail spam/promotions/social category",
  archive: "marketing, bulk, one-time codes, automated no-reply",
  money: "receipts, orders, invoices, statements",
  record: "confirmations, bookings, warranties",
  calendar: "calendar invites",
  fyi: "shipping updates",
  "needs-model": "no free rule matched — a person or a new company",
};
const ORDER = ["skip", "archive", "money", "record", "calendar", "fyi", "needs-model"];

async function one(account) {
  const { api } = openGmail(["--account", account], { allowWrite: false });
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) {
    return { account, error: `the saved sign-in belongs to ${profile.emailAddress}` };
  }
  const rows = await readMessages(api, query, MAX, { log: () => {} });
  const counts = {};
  for (const r of rows) counts[r.action] = (counts[r.action] || 0) + 1;
  const domains = new Map();
  for (const r of rows) if (r.action === "needs-model") domains.set(r.domain || "(unknown)", (domains.get(r.domain || "(unknown)") || 0) + 1);
  return { account, total: rows.length, counts, topUnplaced: [...domains].sort((a, b) => b[1] - a[1]).slice(0, 8) };
}

async function main() {
  const accounts = named ? [named.toLowerCase()] : readdirSync(dir).map(isMailboxToken).filter(Boolean).sort();
  if (!accounts.length) { console.error(`no saved Google sign-ins in ${dir}`); process.exit(1); }

  console.log(`READ-ONLY — ${accounts.length} mailbox${accounts.length === 1 ? "" : "es"} — search: ${query}`);
  console.log("Nothing is changed. No model is called.\n");

  const results = [];
  for (const a of accounts) {
    process.stdout.write(`  reading ${a} ... `);
    try { const r = await one(a); results.push(r); console.log(r.error ? `SKIPPED (${r.error})` : `${r.total} messages`); }
    catch (e) { results.push({ account: a, error: String(e.message).slice(0, 120) }); console.log(`ERROR ${String(e.message).slice(0, 120)}`); }
  }

  const ok = results.filter((r) => !r.error);
  if (!ok.length) { console.log("\nNothing could be read. Check the sign-ins and try one mailbox with --account."); return; }

  const grand = {};
  for (const r of ok) for (const [k, n] of Object.entries(r.counts)) grand[k] = (grand[k] || 0) + n;
  const total = ok.reduce((n, r) => n + r.total, 0);
  const pct = (n, d) => `${Math.round((n / Math.max(d, 1)) * 100)}%`;
  const pad = (s, w) => String(s).padEnd(w);
  const padL = (s, w) => String(s).padStart(w);

  console.log(`\n${"=".repeat(78)}\nPER MAILBOX\n`);
  console.log(`${pad("mailbox", 32)}${padL("read", 7)}${padL("free", 7)}${padL("person", 8)}${padL("free %", 8)}`);
  for (const r of ok) {
    const needs = r.counts["needs-model"] || 0;
    const free = r.total - needs;
    console.log(`${pad(r.account, 32)}${padL(r.total, 7)}${padL(free, 7)}${padL(needs, 8)}${padL(pct(free, r.total), 8)}`);
  }
  const grandNeeds = grand["needs-model"] || 0;
  console.log(`${pad("ALL", 32)}${padL(total, 7)}${padL(total - grandNeeds, 7)}${padL(grandNeeds, 8)}${padL(pct(total - grandNeeds, total), 8)}`);

  console.log(`\n${"=".repeat(78)}\nWHAT THE FREE RULES DID, ALL MAILBOXES\n`);
  for (const a of ORDER) {
    const n = grand[a] || 0;
    if (!n) continue;
    console.log(`${pad(a, 14)}${padL(n, 7)}${padL(pct(n, total), 7)}   ${MEANING[a] || ""}`);
  }

  console.log(`\n${"=".repeat(78)}\nSENDER DOMAINS THE FREE RULES COULD NOT PLACE (these are what a model would be asked about)\n`);
  for (const r of ok) {
    if (!r.topUnplaced.length) continue;
    console.log(`  ${r.account}`);
    for (const [d, n] of r.topUnplaced) console.log(`    ${padL(n, 5)}  ${d}`);
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`VERIFY: ${ok.length} of ${accounts.length} mailboxes read, ${total} messages, ${grandNeeds} would reach a model (${pct(grandNeeds, total)}).`);
  console.log(`Nothing was changed: every session was opened read-only and no write call was made.`);
  const skipped = results.filter((r) => r.error);
  if (skipped.length) console.log(`NOT READ: ${skipped.map((r) => `${r.account} (${r.error})`).join("; ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
