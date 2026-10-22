#!/usr/bin/env node
// Gmail cleanup (phase 2 of the email agent): label and archive only. Run by hand on the Mac mini. Node 20+.
//
//   node scripts/email-apply.mjs --account admin@shvr.co --keep tiller.com,kalshi.com            # DRY RUN (default)
//   node scripts/email-apply.mjs --account admin@shvr.co --keep tiller.com,kalshi.com --limit 20 --apply   # try 20 first
//   node scripts/email-apply.mjs --account admin@shvr.co --keep tiller.com,kalshi.com --apply            # the real run
//   node scripts/email-apply.mjs --account admin@shvr.co --cluster "tiller.com::hello <day>::0"        # archive one named cluster (see email-clusters.mjs), keeping the N newest
//   node scripts/email-apply.mjs --account admin@shvr.co --undo <undo file printed by the run>           # put them back
//
// What it changes, and only this: for inbox mail the free rules call marketing, one-time codes, no-reply notices
// or Gmail's own Promotions/Social categories, it ADDS the label "Dashboard/Handled" and REMOVES the INBOX label.
// The message stays in Gmail (All Mail), keeps its other labels and its read/unread state.
//
// Safety rules:
//   - DRY RUN unless you pass --apply. Without it nothing is changed and no undo file is needed.
//   - NEVER deletes, trashes, moves to Spam, sends, or creates drafts. The only write calls in this file are:
//     create the label "Dashboard/Handled" (once), and messages/batchModify with that label and INBOX.
//   - NEVER touches: starred messages, senders listed in --keep (domain or address; subdomains match), mail the
//     free rules could not place (needs-model), receipts/statements (money), confirmations (record),
//     calendar invites, or shipping updates (fyi).
//   - UNDO: before changing anything it writes a list of message ids to ~/_secrets_local_only/email-agent/undo/;
//     each batch is recorded as it completes; --undo restores exactly those messages to the inbox.
//   - NO MODEL: nothing is sent to Anthropic or anywhere else. Ids and sender addresses are kept locally only.

import { writeFileSync, appendFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dir, die, option, openGmail, readMessages, pattern } from "./email-lib.mjs";

const args = process.argv.slice(2);
const days = parseInt(option(args, "--days") || "90", 10);
const MAX = parseInt(option(args, "--max") || "5000", 10);
const query = option(args, "--q") || `in:inbox newer_than:${days}d`;
const LIMIT = option(args, "--limit") ? parseInt(option(args, "--limit"), 10) : Infinity;
const APPLY = args.includes("--apply");
const UNDO = option(args, "--undo");
const keep = (option(args, "--keep") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
// --cluster "sender-domain::subject pattern::N" (repeatable): archive that exact cluster, keeping the N newest (default 1).
// Patterns are the ones printed by scripts/email-clusters.mjs --show-subjects.
const clusterSpecs = args.flatMap((a, i) => (a === "--cluster" ? [args[i + 1]] : [])).filter(Boolean).map((x) => { const [domain, pat, n] = x.split("::"); return { domain: (domain || "").toLowerCase(), pat: (pat || "").toLowerCase(), keepNewest: n === undefined || n === "" ? 1 : parseInt(n, 10) }; });
const LABEL = "Dashboard/Handled";
const { account, api } = openGmail(args, { allowWrite: true });
const undoDir = join(dir, "undo");

const isKept = (r) => keep.some((k) => r.address === k || r.domain === k || r.domain.endsWith("." + k));

async function ensureLabel() {
  const list = await api("/gmail/v1/users/me/labels");
  const found = (list.labels || []).find((l) => l.name === LABEL);
  if (found) return found.id;
  const made = await api("/gmail/v1/users/me/labels", { method: "POST", body: { name: LABEL, labelListVisibility: "labelShow", messageListVisibility: "show" } });
  return made.id;
}
async function countIds(q) { let n = 0, page = ""; do { const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=500${page ? `&pageToken=${page}` : ""}`); n += (r.messages || []).length; page = r.nextPageToken || ""; } while (page); return n; }
async function batch(ids, add, remove) {
  for (let i = 0; i < ids.length; i += 500) {
    await api("/gmail/v1/users/me/messages/batchModify", { method: "POST", body: { ids: ids.slice(i, i + 500), addLabelIds: add, removeLabelIds: remove } });
    console.log(`  ${Math.min(i + 500, ids.length)}/${ids.length} done`);
  }
}

async function main() {
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);

  // ---------- undo ----------
  if (UNDO) {
    if (!existsSync(UNDO)) die(`undo file not found: ${UNDO}`);
    const applied = existsSync(UNDO + ".applied") ? readFileSync(UNDO + ".applied", "utf8").split("\n").filter(Boolean).flatMap((l) => JSON.parse(l).ids) : [];
    if (!applied.length) die("that run changed nothing, so there is nothing to undo");
    const labelId = await ensureLabel();
    console.log(`UNDO — putting ${applied.length} messages back in the inbox of ${account}`);
    await batch(applied, ["INBOX"], [labelId]);
    const left = await countIds(`label:${LABEL} in:inbox`);
    console.log(`\nDone. Verify: messages in the inbox that still carry ${LABEL}: ${left} (should be 0 for the restored ones).`);
    return;
  }

  console.log(`${APPLY ? "APPLY" : "DRY RUN (nothing will be changed)"} — ${account} — search: ${query}`);
  console.log(`Protected senders (never archived): ${keep.length ? keep.join(", ") : "(none)"}${LIMIT < Infinity ? ` · limit ${LIMIT}` : ""}`);
  const rows = await readMessages(api, query, MAX, { log: console.log });

  const starred = rows.filter((r) => r.labels.includes("STARRED"));
  const kept = rows.filter((r) => isKept(r) && !r.labels.includes("STARRED"));
  let todo = rows.filter((r) => (r.action === "archive" || r.action === "skip") && !r.labels.includes("STARRED") && !isKept(r));
  if (clusterSpecs.length) {   // cluster mode: ONLY the named clusters, never the general rules
    const picked = [];
    for (const c of clusterSpecs) {
      const members = rows.filter((r) => (r.domain === c.domain || r.domain.endsWith("." + c.domain)) && pattern(r.subject) === c.pat && !r.labels.includes("STARRED") && !isKept(r)).sort((a, b) => b.ts - a.ts);
      console.log(`  cluster ${c.domain} "${c.pat.slice(0, 60)}": ${members.length} found, keeping the ${Math.min(c.keepNewest, members.length)} newest`);
      picked.push(...members.slice(c.keepNewest));
    }
    todo = [...new Map(picked.map((r) => [r.id, r])).values()].map((r) => ({ ...r, reason: `cluster: ${r.domain}` }));
  }
  const eligible = todo.length;
  todo = todo.slice(0, LIMIT);
  const stay = rows.length - todo.length;

  const tally = (list, f) => [...list.reduce((m, r) => (m.set(f(r), (m.get(f(r)) || 0) + 1), m), new Map())].sort((a, b) => b[1] - a[1]);
  console.log(`\nScanned ${rows.length}. Would archive ${todo.length}${eligible > todo.length ? ` (of ${eligible} eligible; limited)` : ""}; stays in the inbox: ${stay}.`);
  console.log("  By reason:"); for (const [k, n] of tally(todo, (r) => r.reason)) console.log(`    ${String(n).padStart(5)}  ${k}`);
  console.log(`  Protected by --keep: ${kept.length} · starred: ${starred.length} · needs a person or the model: ${rows.filter((r) => r.action === "needs-model").length} · money/records/invites/shipping: ${rows.filter((r) => ["money", "record", "calendar", "fyi"].includes(r.action)).length}`);
  console.log("  Largest groups to archive (sender domain):"); for (const [k, n] of tally(todo, (r) => r.domain || "(unknown)").slice(0, 12)) console.log(`    ${String(n).padStart(5)}  ${k}`);

  if (!APPLY) { console.log(`\nDRY RUN finished. Nothing was changed. To do it for real, run the same command with --apply (add --limit 20 first to try a small batch).`); return; }
  if (!todo.length) { console.log("\nNothing to archive."); return; }

  // ---------- apply ----------
  mkdirSync(undoDir, { recursive: true, mode: 0o700 });
  const file = join(undoDir, `apply-${account}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ account, label: LABEL, query, keep, at: new Date().toISOString(), messages: todo.map((r) => ({ id: r.id, address: r.address, action: r.action, reason: r.reason })) }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`\nUndo list written first: ${file}`);
  const labelId = await ensureLabel();
  const ids = todo.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await api("/gmail/v1/users/me/messages/batchModify", { method: "POST", body: { ids: chunk, addLabelIds: [labelId], removeLabelIds: ["INBOX"] } });
    appendFileSync(file + ".applied", JSON.stringify({ ids: chunk, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
    console.log(`  ${Math.min(i + 500, ids.length)}/${ids.length} archived`);
  }

  // ---------- verify ----------
  const labelled = await countIds(`label:${LABEL}`);
  const stillIn = await countIds(`label:${LABEL} in:inbox`);
  const remaining = await countIds(query);
  console.log(`\nVerify: messages with ${LABEL}: ${labelled} (this run archived ${ids.length}); of those still in the inbox: ${stillIn} (should be 0); inbox messages matching the search now: ${remaining} (was ${rows.length}).`);
  console.log(stillIn === 0 && labelled >= ids.length ? "PASS" : "CHECK — numbers above do not match; do not run again until we look.");
  console.log(`To put these back in the inbox:\n  node scripts/email-apply.mjs --account ${account} --undo "${file}"`);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
