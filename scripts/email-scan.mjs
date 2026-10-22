#!/usr/bin/env node
// Gmail read-only scan (phase 1 of the email agent). Run by hand on the Mac mini. No dependencies: Node 20+.
//
//   node scripts/email-scan.mjs --account admin@shvr.co                 # inbox, last 90 days
//   node scripts/email-scan.mjs --account admin@shvr.co --days 365 --max 10000
//   node scripts/email-scan.mjs --account admin@shvr.co --q 'in:inbox'   # your own Gmail search instead
//
// What it does: lists the messages in the inbox (default: last 90 days), reads each one's HEADERS and Gmail's
// 100-character snippet only (never the full body, never attachments), and applies the same free rules as
// src/lib/email-funnel.ts (provider category, bulk headers, one-time codes, invites, receipts, confirmations,
// shipping, no-reply). It then writes a report of what the agent WOULD do. It changes NOTHING.
//
// Safety rules:
//   - READ-ONLY: the Gmail session is opened with allowWrite:false (scripts/email-lib.mjs), so any non-GET call throws. No label, archive, move, trash, draft or send call exists
//     in this file. The only POST is Google's token endpoint, to turn the saved refresh token into a short-lived key.
//   - NO MODEL: nothing is sent to Anthropic or anywhere else. Mail the free rules can't place is counted as
//     "would need the model" and left alone.
//   - The report is written only to ~/_secrets_local_only/email-agent/reports/ (mode 600, never cloud-synced).
//     The terminal shows counts and top sender DOMAINS only, no subjects.
//   - Tokens are read from ~/_secrets_local_only/email-agent/google-<account>.json and never printed.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dir, die, option, openGmail, readMessages } from "./email-lib.mjs";

const args = process.argv.slice(2);
const days = parseInt(option(args, "--days") || "90", 10);
const MAX = parseInt(option(args, "--max") || "5000", 10);
const query = option(args, "--q") || `in:inbox newer_than:${days}d`;
const { account, api } = openGmail(args, { allowWrite: false });   // read-only: any non-GET call throws

async function main() {
  console.log(`READ-ONLY SCAN — ${account} — search: ${query}`);
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);
  console.log(`Mailbox has ${profile.messagesTotal} messages in total; scanning only what matches the search.`);
  const t0 = Date.now();
  const rows = await readMessages(api, query, MAX, { log: console.log });

  // ---------- summarise ----------
  const by = (k) => rows.reduce((m, r) => (m.set(r[k], (m.get(r[k]) || 0) + 1), m), new Map());
  const actions = [...by("action")].sort((a, b) => b[1] - a[1]);
  const senders = new Map();
  for (const r of rows) { const k = r.address || "(unknown)"; const s = senders.get(k) || { n: 0, action: r.action, name: r.name, subjects: [] }; s.n++; if (s.subjects.length < 3) s.subjects.push(r.subject); senders.set(k, s); }
  const top = [...senders].sort((a, b) => b[1].n - a[1].n).slice(0, 30);
  const domains = new Map(); for (const r of rows) domains.set(r.domain || "(unknown)", (domains.get(r.domain || "(unknown)") || 0) + 1);
  const topDomains = [...domains].sort((a, b) => b[1] - a[1]).slice(0, 15);

  const pct = (n) => `${Math.round((n / Math.max(rows.length, 1)) * 100)}%`;
  const meaning = { skip: "left alone (already in a Gmail spam/promotions/social category)", archive: "would be labelled Dashboard/Handled and archived (marketing, codes, no-reply)", money: "would be labelled Dashboard/Money (receipt or statement)", record: "would be labelled Dashboard/Records (confirmation)", calendar: "invite: would become a calendar question only if no auto-accept rule", fyi: "would be labelled and archived as an auto-expiring 'just so you know'", "needs-model": "no free rule matched: would go to the model for a task-or-not decision (NOT run in this scan)" };

  const md = [];
  md.push(`# Gmail read-only scan: ${account}`, `Search: \`${query}\` · ${rows.length} messages · ${new Date().toISOString()}`, "", "Nothing was changed in the mailbox and nothing was sent to any model.", "", "## What the free rules would do", "");
  md.push("| action | messages | share | meaning |", "|---|---:|---:|---|");
  for (const [a, n] of actions) md.push(`| ${a} | ${n} | ${pct(n)} | ${meaning[a] || ""} |`);
  md.push("", "## Top senders", "", "| messages | sender | would do | example subjects |", "|---:|---|---|---|");
  for (const [addr, s] of top) md.push(`| ${s.n} | ${s.name ? s.name + " " : ""}<${addr}> | ${s.action} | ${s.subjects.map((x) => x.replace(/\|/g, "/").slice(0, 60)).join(" · ")} |`);
  md.push("", "## Samples per action (up to 6 each)", "");
  for (const [a] of actions) { md.push(`### ${a}`); for (const r of rows.filter((x) => x.action === a).slice(0, 6)) md.push(`- ${r.date} · ${r.address} · ${r.subject.slice(0, 80)}`); md.push(""); }
  const outDir = join(dir, "reports"); mkdirSync(outDir, { recursive: true, mode: 0o700 });
  let file = join(outDir, `scan-${account}-${new Date().toISOString().slice(0, 10)}.md`);
  for (let n = 2; existsSync(file); n++) file = file.replace(/(-\d+)?\.md$/, `-${n}.md`);   // never overwrite an earlier report
  writeFileSync(file, md.join("\n") + "\n", { flag: "wx", mode: 0o600 });

  console.log(`\nPASS — ${rows.length} messages read in ${Math.round((Date.now() - t0) / 1000)}s. Nothing was changed.\n`);
  console.log("What the free rules would do:");
  for (const [a, n] of actions) console.log(`  ${String(n).padStart(6)}  ${pct(n).padStart(4)}  ${a}`);
  console.log("\nBusiest sender domains:");
  for (const [d, n] of topDomains) console.log(`  ${String(n).padStart(6)}  ${d}`);
  console.log(`\nFull report (private, local only): ${file}`);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
