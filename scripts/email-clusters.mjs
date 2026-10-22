#!/usr/bin/env node
// Gmail read-only clustering: finds groups of inbox mail that are probably "the same issue"
// (same sender, same subject pattern once numbers, dates and amounts are stripped). Node 20+.
//
//   node scripts/email-clusters.mjs --account admin@shvr.co --q 'in:inbox' --max 10000
//   node scripts/email-clusters.mjs --account admin@shvr.co --q 'in:inbox' --show-subjects
//
// Read-only: the session is opened with allowWrite:false, so any non-GET call throws. NO MODEL: nothing leaves
// this machine. It reads headers and Gmail's 100-character snippet only (scripts/email-lib.mjs).
// Terminal: counts per cluster and sender domain; subject patterns only with --show-subjects.
// Full report (with example subjects and message ids): ~/_secrets_local_only/email-agent/reports/ (mode 600, never overwritten).

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dir, die, option, openGmail, readMessages, pattern } from "./email-lib.mjs";

const args = process.argv.slice(2);
const query = option(args, "--q") || "in:inbox";
const MAX = parseInt(option(args, "--max") || "10000", 10);
const MIN = parseInt(option(args, "--min") || "3", 10);
const SHOW = args.includes("--show-subjects");
const { account, api } = openGmail(args, { allowWrite: false });

async function main() {
  console.log(`READ-ONLY CLUSTERS — ${account} — search: ${query}`);
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);
  const rows = await readMessages(api, query, MAX, { log: console.log });

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.address}|${pattern(r.subject)}`;
    const g = groups.get(key) || { address: r.address, domain: r.domain, pattern: pattern(r.subject), action: r.action, n: 0, first: r.date, last: r.date, ids: [], subjects: [] };
    g.n++; g.ids.push(r.id); if (r.date < g.first) g.first = r.date; if (r.date > g.last) g.last = r.date;
    if (g.subjects.length < 3) g.subjects.push(r.subject);
    groups.set(key, g);
  }
  const clusters = [...groups.values()].filter((g) => g.n >= MIN).sort((a, b) => b.n - a.n);
  const covered = clusters.reduce((n, g) => n + g.n, 0);

  const md = [`# Gmail clusters: ${account}`, `Search \`${query}\` · ${rows.length} messages · ${clusters.length} clusters of ${MIN}+ · ${new Date().toISOString()}`, "", "Nothing was changed and nothing was sent to any model.", "", "| messages | sender | subject pattern | rule action | first | last | example subjects |", "|---:|---|---|---|---|---|---|"];
  for (const g of clusters) md.push(`| ${g.n} | ${g.address} | ${g.pattern.replace(/\|/g, "/")} | ${g.action} | ${g.first} | ${g.last} | ${g.subjects.map((x) => x.replace(/\|/g, "/").slice(0, 60)).join(" · ")} |`);
  const outDir = join(dir, "reports"); mkdirSync(outDir, { recursive: true, mode: 0o700 });
  let file = join(outDir, `clusters-${account}-${new Date().toISOString().slice(0, 10)}.md`);
  for (let n = 2; existsSync(file); n++) file = file.replace(/(-\d+)?\.md$/, `-${n}.md`);
  writeFileSync(file, md.join("\n") + "\n", { flag: "wx", mode: 0o600 });

  console.log(`\nPASS — ${rows.length} messages read. ${clusters.length} clusters of ${MIN}+ messages cover ${covered} of them. Nothing was changed.\n`);
  console.log("Biggest clusters:");
  for (const g of clusters.slice(0, 20)) console.log(`  ${String(g.n).padStart(5)}  ${g.domain.padEnd(28)} ${g.first}..${g.last}  rule: ${g.action}${SHOW ? `\n         "${g.pattern.slice(0, 90)}"` : ""}`);
  console.log(`\nFull report (private, local only): ${file}`);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
