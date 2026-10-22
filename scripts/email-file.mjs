#!/usr/bin/env node
// Mail FILER: moves mail out of the inbox once it has been dealt with in the app. Run by hand on the Mac mini. Node 20+.
//
//   node scripts/email-file.mjs --account admin@shvr.co            # DRY RUN (default): shows what it would file and why
//   node scripts/email-file.mjs --account admin@shvr.co --apply    # labels Dashboard/Handled and archives; undo list written first
//   node scripts/email-file.mjs --account admin@shvr.co --undo "<undo file>"      # same undo as email-apply.mjs
//
// The email agent (email-agent.mjs) only reads mail and makes tasks. THIS script is the other half: it files mail.
// It files a message only when the app already shows it as dealt with:
//   1. TASK RULE     a task made from that mail (origin_kind 'email', merge_key email:<account>:...) is DONE or DISMISSED
//                    in the app -> every email linked to that task that is still in the inbox is filed.
//   2. RECEIPT RULE  a receipt (the free "money" rule) is filed only when ALL of these hold:
//                      - its sender matches a subscription on the register (recurring_items.merchant_key = sender domain family, status active),
//                      - an amount is visible in the subject or preview, and it is UNDER the threshold (default $100, --threshold),
//                      - the sighting is recorded first in recurring_observations (append-only), so the filed mail has a record behind it.
//                    No match, no visible amount, or $100 and over: it stays in the inbox. (Over $100 always asks; no match asks.)
//   3. MODEL RULE    a message the model judged 'needs nothing' (saved by email-agent.mjs --model-triage), or a repeat group where every judged
//                    message says so -> filed. Never receipts. --skip-model-rule turns it off; the dry run lists senders and examples to spot-check.
// Never filed: starred mail, anything with an OPEN task, anything the rules above do not name. Nothing is ever deleted;
// "filed" = label Dashboard/Handled + removed from the inbox, exactly as email-apply.mjs does, so its --undo works on this script's undo files.
// Secrets: ~/_secrets_local_only/family-dashboard.env (SUPABASE_URL, SUPABASE_SERVICE_KEY), same as the other agents.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { die, option, openGmail, readMessages, dir, pattern, merchantKey, amountOf } from "./email-lib.mjs";
import { loadCache } from "./email-triage-lib.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const UNDO = option(args, "--undo");
const SKIP_MODEL = args.includes("--skip-model-rule");
const SHOW_ALL = args.includes("--show-all");
const THRESHOLD = parseFloat(option(args, "--threshold") || "100");
const LABEL = "Dashboard/Handled";
const { account, api } = openGmail(args, { allowWrite: true });
const undoDir = join(dir, "undo");

let env = {};
try { for (const line of readFileSync(option(args, "--env-file") || join(homedir(), "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const SB_URL = option(args, "--supabase-url") || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

async function ensureLabel() {
  const list = await api("/gmail/v1/users/me/labels");
  const found = (list.labels || []).find((l) => l.name === LABEL);
  if (found) return found.id;
  return (await api("/gmail/v1/users/me/labels", { method: "POST", body: { name: LABEL, labelListVisibility: "labelShow", messageListVisibility: "show" } })).id;
}
async function countIds(q) { let n = 0, page = ""; do { const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=500${page ? `&pageToken=${page}` : ""}`); n += (r.messages || []).length; page = r.nextPageToken || ""; } while (page); return n; }

async function main() {
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);
  if (!SB_URL || !SB_KEY) die("no SUPABASE_URL / SUPABASE_SERVICE_KEY found in ~/_secrets_local_only/family-dashboard.env");

  if (UNDO) {   // identical to email-apply.mjs --undo
    if (!existsSync(UNDO)) die(`undo file not found: ${UNDO}`);
    const applied = existsSync(UNDO + ".applied") ? readFileSync(UNDO + ".applied", "utf8").split("\n").filter(Boolean).flatMap((l) => JSON.parse(l).ids) : [];
    if (!applied.length) die("that run changed nothing, so there is nothing to undo");
    const labelId = await ensureLabel();
    for (let i = 0; i < applied.length; i += 500) await api("/gmail/v1/users/me/messages/batchModify", { method: "POST", body: { ids: applied.slice(i, i + 500), addLabelIds: ["INBOX"], removeLabelIds: [labelId] } });
    console.log(`UNDO — put ${applied.length} messages back in the inbox of ${account}.`);
    await rest("POST", "activity_log", { actor: "email-filer", action: "mail_unfiled", subject: `${account}: ${applied.length} messages put back in the inbox`, ref: account, undoable: false });
    return;
  }

  console.log(`${APPLY ? "APPLY" : "DRY RUN (nothing will be changed)"} — mail filer — ${account} — receipts under $${THRESHOLD}`);
  const inbox = await readMessages(api, "in:inbox", 10000, { log: console.log });
  const byId = new Map(inbox.map((r) => [r.id, r]));
  const plan = new Map();   // message id -> { row, rule, why }
  const add = (r, rule, why, extra = {}) => { if (r && !r.labels.includes("STARRED") && !plan.has(r.id)) plan.set(r.id, { r, rule, why, ...extra }); };

  // ---- rule 1: tasks you finished or dismissed ----
  const closed = await rest("GET", `tasks?merge_key=like.${encodeURIComponent(`email:${account}:*`)}&status=in.(done,dismissed)&select=id,title,status,origins`);
  const openT = await rest("GET", `tasks?merge_key=like.${encodeURIComponent(`email:${account}:*`)}&status=in.(open,snoozed)&select=origins`);
  const holdIds = new Set(openT.flatMap((t) => (t.origins || []).map((o) => o.id)));   // mail that belongs to a task still open stays put
  let taskMsgs = 0;
  for (const t of closed) for (const o of t.origins || []) {
    if (holdIds.has(o.id)) continue;
    const r = byId.get(o.id); if (!r) continue;   // already out of the inbox
    add(r, "task", `${t.status}: ${t.title}`); taskMsgs++;
  }

  // ---- rule 2: receipts that match a registered subscription and are under the threshold ----
  const reg = await rest("GET", "recurring_items?merchant_key=not.is.null&status=eq.active&select=id,name,merchant_key");
  const regBy = new Map(reg.map((x) => [x.merchant_key, x]));
  let noMatch = 0, noAmount = 0, over = 0;
  const receipts = inbox.filter((r) => r.action === "money" && !holdIds.has(r.id));
  for (const r of receipts) {
    const sub = regBy.get(merchantKey(r.name, r.domain)) || regBy.get(merchantKey("", r.domain)); const amt = amountOf(r);
    if (!sub) { noMatch++; continue; }
    if (amt === null) { noAmount++; continue; }
    if (amt >= THRESHOLD) { over++; continue; }
    add(r, "receipt", `${sub.name} $${amt.toFixed(2)} (registered subscription)`, { sub, amt });
  }

  // ---- rule 3: mail the model judged "needs nothing" (from the triage cache the email agent keeps) ----
  // Single messages use their own verdict. A repeat group (3 or more with the same sender and subject pattern) inherits the verdict
  // of the newest message the model read, but only when every verdict in that group says "needs nothing".
  // Never: receipts, starred mail, mail behind an open task, or anything the model rated as needing action at any urgency.
  let modelFiled = 0, noCache = 0;
  if (!SKIP_MODEL) {
    const cache = loadCache(account);
    if (!Object.keys(cache).length) console.log("\n(no model decisions saved for this account yet, so the model rule has nothing to use; run email-agent.mjs --model-triage first)");
    const groups = new Map();
    for (const r of inbox) { const k = `${r.address}|${pattern(r.subject)}`; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
    for (const list of groups.values()) {
      const verdicts = list.map((r) => cache[r.id]).filter(Boolean);
      const allQuiet = verdicts.length > 0 && verdicts.every((d) => d.needs_action === false);
      for (const r of list) {
        if (r.action === "money" || holdIds.has(r.id) || r.labels.includes("STARRED") || plan.has(r.id)) continue;
        const own = cache[r.id];
        if (own) { if (own.needs_action === false) add(r, "model", `model: needs nothing — ${String(own.why || own.title || "").slice(0, 70)}`); continue; }
        if (list.length >= 3 && allQuiet) add(r, "model", `model: repeat group needs nothing — ${String(verdicts[0].why || "").slice(0, 60)}`);
        else if (r.action === "needs-model") noCache++;
      }
    }
    modelFiled = [...plan.values()].filter((x) => x.rule === "model").length;
  }

  const todo = [...plan.values()];
  console.log(`\nScanned ${inbox.length}. Would file ${todo.length}: ${todo.filter((x) => x.rule === "task").length} from finished/dismissed tasks, ${todo.filter((x) => x.rule === "receipt").length} receipts, ${modelFiled} the model judged as needing nothing.`);
  if (noCache) console.log(`${noCache} messages the model has not judged yet stay in the inbox.`);
  console.log(`Receipts staying in the inbox: ${noMatch} with no registered subscription (they need your answer), ${noAmount} with no visible amount, ${over} at $${THRESHOLD} or more (always asks). Registered subscriptions: ${reg.length}.`);
  if (modelFiled) {
    const by = new Map(); for (const x of todo.filter((y) => y.rule === "model")) by.set(x.r.domain, (by.get(x.r.domain) || 0) + 1);
    console.log("\nModel rule — by sender (check these look like mail you do not need):");
    for (const [d, n] of [...by].sort((a, b) => b[1] - a[1]).slice(0, SHOW_ALL ? 999 : 15)) console.log(`  ${String(n).padStart(4)}  ${d}`);
    console.log("\nA spread of examples, one per sender (use --show-all for every message):");
    const seen = new Set();
    for (const x of todo.filter((y) => y.rule === "model")) { if (!SHOW_ALL && (seen.has(x.r.domain) || seen.size >= 25)) continue; seen.add(x.r.domain); console.log(`  ${x.r.domain.padEnd(24)} ${x.r.subject.slice(0, 48).padEnd(48)} — ${x.why.replace("model: ", "").slice(0, 60)}`); }
    console.log("");
  }
  for (const x of todo.filter((y) => y.rule !== "model").slice(0, 30)) console.log(`  ${x.rule.padEnd(7)} ${x.r.domain.padEnd(24)} ${x.r.subject.slice(0, 50).padEnd(50)} — ${x.why.slice(0, 60)}`);
  if (!APPLY) { console.log("\nDRY RUN finished. Nothing was changed. Run again with --apply to file these."); return; }
  if (!todo.length) { console.log("\nNothing to file."); return; }

  // ---- record the receipts first (append-only; a re-run adds nothing twice) ----
  const obs = todo.filter((x) => x.rule === "receipt").map((x) => ({ recurring_id: x.sub.id, merchant_key: x.sub.merchant_key, source: "receipt", signal: "charge", observed_on: x.r.date, amount: x.amt, ref: `gmail:${account}:${x.r.id}`, mailbox: account }));
  if (obs.length) {
    const refs = obs.map((o) => `"${o.ref}"`).join(",");
    const had = new Set((await rest("GET", `recurring_observations?source=eq.receipt&ref=in.(${refs})&select=ref`)).map((h) => h.ref));
    const fresh = obs.filter((o) => !had.has(o.ref));
    if (fresh.length) await rest("POST", "recurring_observations", fresh, { Prefer: "return=minimal" });
    const ok = new Set((await rest("GET", `recurring_observations?source=eq.receipt&ref=in.(${refs})&select=ref`)).map((h) => h.ref));
    for (const x of [...todo]) if (x.rule === "receipt" && !ok.has(`gmail:${account}:${x.r.id}`)) { plan.delete(x.r.id); console.log(`  not filed (record could not be confirmed): ${x.r.subject.slice(0, 60)}`); }
  }
  const final = [...plan.values()];

  mkdirSync(undoDir, { recursive: true, mode: 0o700 });
  const file = join(undoDir, `file-${account}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ account, label: LABEL, at: new Date().toISOString(), messages: final.map((x) => ({ id: x.r.id, address: x.r.address, action: x.rule, reason: x.why })) }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`\nUndo list written first: ${file}`);
  const labelId = await ensureLabel(); const ids = final.map((x) => x.r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await api("/gmail/v1/users/me/messages/batchModify", { method: "POST", body: { ids: chunk, addLabelIds: [labelId], removeLabelIds: ["INBOX"] } });
    appendFileSync(file + ".applied", JSON.stringify({ ids: chunk, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
    console.log(`  ${Math.min(i + 500, ids.length)}/${ids.length} filed`);
  }
  const line = `${account}: ${ids.length} emails filed (${final.filter((x) => x.rule === "task").length} from finished tasks, ${final.filter((x) => x.rule === "receipt").length} receipts matched to a subscription, ${final.filter((x) => x.rule === "model").length} the model judged as needing nothing)`;
  await rest("POST", "activity_log", { actor: "email-filer", action: "mail_filed", subject: line, ref: account, undoable: true });

  // ---- verify ----
  const stillIn = await countIds(`label:${LABEL} in:inbox`);
  const left = (await readMessages(api, "in:inbox", 10000, {})).filter((r) => ids.includes(r.id)).length;
  console.log(`\nVerify: ${ids.length} filed; of those still in the inbox: ${left} (should be 0); messages carrying ${LABEL} that are in the inbox: ${stillIn} (should be 0).`);
  console.log(left === 0 && stillIn === 0 ? "PASS" : "CHECK — numbers above do not match; do not run again until we look.");
  console.log(`To put these back:\n  node scripts/email-file.mjs --account ${account} --undo "${file}"`);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
