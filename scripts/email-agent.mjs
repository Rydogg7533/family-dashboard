#!/usr/bin/env node
// Mail agent, STEP 1 + MODEL TRIAGE: SUGGEST ONLY. Run by hand on the Mac mini. No model, no dependencies: Node 20+.
//
//   node scripts/email-agent.mjs --account admin@shvr.co                 # DRY RUN (default): shows what it would suggest
//   node scripts/email-agent.mjs --account admin@shvr.co --apply         # writes the suggestions to the app
//
// What it does: reads the inbox (headers + Gmail's short snippet only), groups mail that is probably "the same issue"
// (same sender + same subject pattern), and writes ONE task per group into the app's tasks table, with links to every
// email in the group. Receipts that repeat from the same sender become "Subscription?" suggestions. Mail the free
// rules cannot place (single messages from people or new companies) is only COUNTED: judging it needs the model,
// which is off unless you pass --model-triage (see below).
//
//   --model-triage     ALSO ask the small Claude model (Haiku) about each single message: sender, subject, date and Gmail's
//                      ~100-character preview only, never the body. Decisions are cached locally (triage-cache-<account>.json), so
//                      each message is paid for once. Urgent ones (urgency now/soon) become tasks; --include-whenever adds the rest.
//   --receipts-from-handled   ALSO read receipts already filed under Dashboard/Handled, so subscriptions are still found after the filer has run.
//                      Reads only receipt-like mail there; changes nothing. Slower on a big Handled label.
//   --model-limit N    most messages to send in one run (default 300).
//
// Safety rules:
//   - NEVER touches the mailbox. Gmail is opened with allowWrite:false (scripts/email-lib.mjs): any non-GET call throws.
//     No label, archive, move, draft or send call exists in this file.
//   - NO MODEL unless --model-triage: then the only other call is to Anthropic's API (key from the same env file, never printed).
//     Email text is untrusted: the model is told to ignore instructions in it, and its answer is only parsed as JSON into task text.
//   - Safe to run twice: each task has a merge_key (email:<account>:<sender>:<subject pattern>). A group that already
//     has an OPEN task is updated; a task you marked done, snoozed or dismissed is never reopened.
//   - Tasks are written as tier 2 (one tap), kind 'decide', origin_kind 'email', origin_ref = a Gmail link. Never contents.
//   - Every task created gets an activity_log row (actor 'email-agent'), plus one summary row per run.
// Secrets: ~/_secrets_local_only/family-dashboard.env (SUPABASE_URL, SUPABASE_SERVICE_KEY), same as the other agents.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { die, option, openGmail, readMessages, pattern, merchantKey, amountOf, cycleOf } from "./email-lib.mjs";
import { loadKey, ask, loadCache, saveCache } from "./email-triage-lib.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const query = option(args, "--q") || "in:inbox";
const MAX = parseInt(option(args, "--max") || "10000", 10);
const MIN = parseInt(option(args, "--min") || "3", 10);          // messages in a group before it becomes a task
const MIN_RECEIPTS = parseInt(option(args, "--min-receipts") || "2", 10);
const PERSON = option(args, "--person") || "Ryan";
const TRIAGE = args.includes("--model-triage");
const HANDLED = args.includes("--receipts-from-handled");   // ALSO look for receipts already filed under Dashboard/Handled (only to find subscriptions)
const MODEL_LIMIT = parseInt(option(args, "--model-limit") || "300", 10);
const INCLUDE_WHENEVER = args.includes("--include-whenever");
const MODEL = option(args, "--model") || "claude-haiku-5-5";
const API = option(args, "--anthropic-url") || "https://api.anthropic.com/v1/messages";
const PRICE_IN = parseFloat(option(args, "--price-in") || "0.10"), PRICE_OUT = parseFloat(option(args, "--price-out") || "0.50");   // Haiku 5.5 per million tokens
const { account, api } = openGmail(args, { allowWrite: false });

// ---------- Supabase (service key, same pattern as filing-agent.mjs) ----------
let env = {};
try { for (const line of readFileSync(option(args, "--env-file") || join(homedir(), "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below when --apply */ }
const SB_URL = option(args, "--supabase-url") || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

const gmailUrl = (id) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${id}`;
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function main() {
  console.log(`${APPLY ? "APPLY" : "DRY RUN (nothing will be written)"} — mail agent step 1 (suggest only) — ${account} — search: ${query}`);
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);
  const rows = await readMessages(api, query, MAX, { log: console.log });
  let handledReceipts = [];
  if (HANDLED) {
    console.log("\nReading receipts already filed under Dashboard/Handled (to find subscriptions)…");
    handledReceipts = (await readMessages(api, 'label:Dashboard/Handled (receipt OR invoice OR "your order" OR "payment received" OR statement)', MAX, { log: console.log })).filter((r) => r.action === "money");
    console.log(`  ${handledReceipts.length} receipts found there.`);
  }

  // group candidates: mail the free rules could not place, and receipts
  const groups = new Map();
  for (const r of [...rows, ...handledReceipts].filter((x) => x.action === "needs-model" || x.action === "money")) {
    const key = `${r.address}|${pattern(r.subject)}`;
    const g = groups.get(key) || { key, address: r.address, domain: r.domain, name: r.name, pat: pattern(r.subject), action: r.action, msgs: [] };
    g.msgs.push(r); groups.set(key, g);
  }
  const tasks = []; let single = 0, singleReceipts = 0; const singleRows = [];
  for (const g of groups.values()) {
    g.msgs.sort((a, b) => b.ts - a.ts);
    const n = g.msgs.length, newest = g.msgs[0], oldest = g.msgs[n - 1];
    const who = g.name || g.domain;
    let title, summary;
    if (g.action === "money" && n >= MIN_RECEIPTS) {
      title = `Subscription? ${who} receipts (×${n})`;
      summary = `${n} receipts from ${g.address} between ${oldest.date} and ${newest.date}; this looks recurring. Add it to the Subscriptions register, or explain it.`;
    } else if (g.action === "needs-model" && n >= MIN) {
      title = `${who}: ${short(newest.subject || "(no subject)", 60)} (×${n})`;
      summary = `${n} similar emails from ${g.address} between ${oldest.date} and ${newest.date}. Archive them all, make a rule, or keep this as a task. The newest is linked.`;
    } else { if (g.action === "money") singleReceipts += n; else { single += n; singleRows.push(...g.msgs); } continue; }
    tasks.push({ merge_key: `email:${account}:${g.domain}:${g.pat}`, kind: "decide", tier: 2, origin_kind: "email", origin_ref: gmailUrl(newest.id), title, summary,
      origins: g.msgs.slice(0, 100).map((m) => ({ kind: "email", account, id: m.id, date: m.date, url: gmailUrl(m.id) })), count: n, sub: g.action === "money", rep: g.action === "needs-model" ? newest : null,
      cand: g.action === "money" ? { merchant_key: merchantKey(g.name, g.domain), name: who, address: g.address, domain: g.domain, mailbox: account, task_merge_key: `email:${account}:${g.domain}:${g.pat}`, receipt_count: n, first_seen: oldest.date, last_seen: newest.date, amount_hint: g.msgs.map(amountOf).find((x) => x !== null) ?? null, cycle_hint: cycleOf(g.msgs.map((m) => m.date)) } : null });
  }

  // A merchant you already answered (subscription or not) is never asked about again.
  const cands = new Map();
  if (SB_URL && SB_KEY) { try { for (const c of await rest("GET", "subscription_candidates?select=merchant_key,status,amount_hint,cycle_hint")) cands.set(c.merchant_key, c); } catch (e) { console.log(`  (could not read earlier answers: ${e.message})`); } }
  let answered = 0;
  for (let i = tasks.length - 1; i >= 0; i--) { const c = tasks[i].cand && cands.get(tasks[i].cand.merchant_key); if (c && c.status !== "asking") { tasks.splice(i, 1); answered++; } }
  if (answered) console.log(`\n${answered} merchants you already answered are not asked about again.`);

  // ---------- optional: model triage ----------
  // The model judges every single message AND the newest message of each repeat group (so a group of failed-payment
  // notices gets a real urgency, and a group of test bookings can be dropped). Same-topic answers merge into one task.
  let modelNote = "";
  if (TRIAGE) {
    const key = loadKey(option(args, "--env-file"));
    if (!key) die("--model-triage needs ANTHROPIC_API_KEY in ~/_secrets_local_only/family-dashboard.env");
    const today = new Date().toISOString().slice(0, 10);
    const cache = loadCache(account);
    const fresh0 = (id) => !cache[id] || cache[id].topic === undefined;                // answers saved before "topic" existed are asked again
    const candidates = [...singleRows, ...tasks.filter((t) => t.rep).map((t) => t.rep)];
    const fresh = candidates.filter((r) => fresh0(r.id)).sort((a, b) => b.ts - a.ts).slice(0, MODEL_LIMIT);
    let inTok = 0, outTok = 0, unreadable = 0, next = 0;
    console.log(`\nModel triage: ${candidates.length} messages (${singleRows.length} single, ${candidates.length - singleRows.length} group representatives), ${candidates.length - candidates.filter((r) => fresh0(r.id)).length} already decided (cached), asking about ${fresh.length} now.`);
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (;;) {
        const i = next++; if (i >= fresh.length) return;
        try { const a = await ask(fresh[i], { key, api: API, model: MODEL, today }); inTok += a.inTok; outTok += a.outTok; if (a.out) cache[fresh[i].id] = { ...a.out, topic: String(a.out.topic || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40), at: today }; else unreadable++; }
        catch (e) { unreadable++; }
      }
    }));
    saveCache(account, cache);
    const cost = (inTok * PRICE_IN + outTok * PRICE_OUT) / 1e6;
    const wants = (d) => d && d.needs_action && ["reply", "do", "decide"].includes(d.kind) && (INCLUDE_WHENEVER || d.urgency !== "whenever");
    const dueOf = (u) => (u === "now" ? new Date().toISOString() : u === "soon" ? new Date(Date.now() + 3 * 86400000).toISOString() : null);
    const rank = { now: 0, soon: 1, whenever: 2 };

    // repeat groups: the newest message's verdict sets kind, title and urgency; "needs nothing" drops the task
    const dropped = [];
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]; if (!t.rep) continue;
      const d = cache[t.rep.id]; if (!d) continue;                                     // unjudged: keep the generic task
      if (!wants(d)) { dropped.push(`${t.title}`); tasks.splice(i, 1); continue; }
      t.kind = d.kind; t.due_at = dueOf(d.urgency); t.title = short(`${d.title || t.title} (×${t.count})`, 90); t.summary = short(`${d.why || ""} ${t.summary}`, 300);
    }
    // single messages: same topic = one task
    const byTopic = new Map(); let noAction = 0, quiet = 0;
    for (const r of singleRows) {
      const d = cache[r.id]; if (!d || d.topic === undefined) continue;
      if (!wants(d)) { if (d.needs_action) quiet++; else noAction++; continue; }
      const k = d.topic ? `topic:${d.topic}` : `msg:${r.id}`;
      (byTopic.get(k) || byTopic.set(k, []).get(k)).push({ r, d });
    }
    for (const [k, list] of byTopic) {
      list.sort((a, b) => rank[a.d.urgency] - rank[b.d.urgency] || b.r.ts - a.r.ts);
      const { r, d } = list[0], n = list.length;
      tasks.push({ merge_key: `email:${account}:${k}`, kind: d.kind, tier: 2, origin_kind: "email", origin_ref: gmailUrl(r.id), due_at: dueOf(d.urgency),
        title: short(`${String(d.title || r.subject || "(no subject)")}${n > 1 ? ` (×${n})` : ""}`, 90), summary: short(`${d.why || ""} (${r.name || r.domain}, ${r.date}${n > 1 ? `; ${n} emails about this` : ""})`, 300),
        origins: list.slice(0, 100).map((x) => ({ kind: "email", account, id: x.r.id, date: x.r.date, url: gmailUrl(x.r.id) })), count: n, sub: false, rep: null });
    }
    modelNote = ` Model: ${fresh.length - unreadable} answered, ${unreadable} unreadable, ${noAction} single messages need nothing, ${quiet} lower-urgency left out, ${dropped.length} repeat groups judged "needs nothing" and dropped; ${inTok} tokens in, ${outTok} out, about $${cost.toFixed(4)}.`;
    if (dropped.length) { console.log("\nGroups the model says need nothing (no task made):"); for (const x of dropped) console.log(`   - ${x}`); }
  }
  tasks.sort((a, b) => String(a.due_at || "z").localeCompare(String(b.due_at || "z")) || b.count - a.count);   // urgent first, then biggest group

  console.log(`\nScanned ${rows.length}.${modelNote} ${tasks.length} suggestions (${tasks.filter((t) => t.sub).length} subscription candidates). Left alone: ${TRIAGE ? "(see model line)" : `${single} single messages that need the model to judge`}, ${singleReceipts} one-off receipts, ${rows.filter((r) => !["needs-model", "money"].includes(r.action)).length} others the rules already handle.`);
  for (const t of tasks.slice(0, 40)) console.log(`  ${String(t.count).padStart(4)}  ${t.due_at ? (Date.parse(t.due_at) - Date.now() < 86400000 ? "NOW  " : "soon ") : "     "}${t.kind.padEnd(6)} ${t.title}`);
  if (tasks.length > 40) console.log(`  … and ${tasks.length - 40} more`);
  if (!APPLY) { console.log("\nDRY RUN finished. Nothing was written. Run again with --apply to put these in the app."); return; }

  if (!SB_URL || !SB_KEY) die("no SUPABASE_URL / SUPABASE_SERVICE_KEY found in ~/_secrets_local_only/family-dashboard.env");
  const people = await rest("GET", `profiles?display_name=eq.${encodeURIComponent(PERSON)}&select=id`);
  if (!people?.length) die(`no profile named ${PERSON} in the app`);
  const person = people[0].id;

  let created = 0, updated = 0, skipped = 0;
  for (const t of tasks) {
    const { count, sub, rep, cand, ...row } = t;
    const ex = await rest("GET", `tasks?merge_key=eq.${encodeURIComponent(t.merge_key)}&select=id,status`);
    if (!ex.length) {
      const made = await rest("POST", "tasks", { ...row, person }, { Prefer: "return=representation" });
      await rest("POST", "activity_log", { actor: "email-agent", action: "task_suggested", subject: short(t.title, 200), ref: made[0].id, undoable: false });
      created++;
    } else if (ex[0].status === "open") {
      await rest("PATCH", `tasks?id=eq.${ex[0].id}`, { title: t.title, summary: t.summary, origins: t.origins, origin_ref: t.origin_ref, updated_at: new Date().toISOString() });
      updated++;
    } else skipped++;
  }
  // remember each possible subscription for the Subscriptions page (the answer columns are never touched here)
  const byKey = new Map();
  for (const t of tasks.filter((x) => x.cand && x.cand.merchant_key)) {
    const c = t.cand, o = byKey.get(c.merchant_key);
    if (!o) { byKey.set(c.merchant_key, { ...c }); continue; }
    o.receipt_count += c.receipt_count; o.first_seen = o.first_seen < c.first_seen ? o.first_seen : c.first_seen;
    if (c.last_seen > o.last_seen) { o.last_seen = c.last_seen; o.amount_hint = c.amount_hint ?? o.amount_hint; }
    o.cycle_hint = o.cycle_hint ?? c.cycle_hint;
  }
  if (byKey.size) {
    const body = [...byKey.values()].map((c) => ({ ...c, amount_hint: c.amount_hint ?? cands.get(c.merchant_key)?.amount_hint ?? null, cycle_hint: c.cycle_hint ?? cands.get(c.merchant_key)?.cycle_hint ?? null, updated_at: new Date().toISOString() }));
    await rest("POST", "subscription_candidates?on_conflict=merchant_key", body, { Prefer: "resolution=merge-duplicates,return=minimal" });
  }
  const line = `${account}: ${rows.length} emails read, ${created} tasks suggested, ${updated} updated, ${skipped} left (already handled by you), no mailbox changes${TRIAGE ? ", model triage on" : ""}`;
  await rest("POST", "activity_log", { actor: "email-agent", action: "email_run", subject: line, ref: account, undoable: false });
  try { await rest("POST", "system_status?on_conflict=key", { key: "email_agent", state: "ok", summary: line, updated_at: new Date().toISOString() }, { Prefer: "resolution=merge-duplicates" }); } catch (e) { console.log(`  (health line not updated: ${e.message})`); }

  // verify: read the rows back
  const back = await rest("GET", `tasks?merge_key=like.${encodeURIComponent(`email:${account}:*`)}&select=id,status,origins`);
  const open = back.filter((x) => x.status === "open").length;
  console.log(`\nVerify: tasks for this account in the app: ${back.length} (${open} open); this run created ${created}, updated ${updated}, skipped ${skipped}.`);
  console.log(back.length >= created + updated + skipped ? "PASS" : "CHECK — the counts do not match; do not run again until we look.");
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
