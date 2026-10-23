#!/usr/bin/env node
// iCloud triage: the model step for mail the free rules cannot place. Run by hand on the Mac mini. Node 20+.
//
//   node scripts/icloud-triage.mjs --window 0-12              # DRY RUN: counts, what would be sent, cost estimate. Sends nothing.
//   node scripts/icloud-triage.mjs --window 0-12 --ask        # asks the model (sender, subject, date, ~220-char preview only), caches, prints a batch review. Changes nothing else.
//   node scripts/icloud-triage.mjs --window 0-12 --apply      # acts on the CACHED answers only (never calls the model): tasks + moves. Add --limit N to do the newest N.
//   undo: node scripts/icloud-file.mjs --undo <file printed by --apply>   (same undo format)
//   options: --never a.com,b@c.com (more senders to never send)  --months 12  --include-whenever  --model-limit 300  --keep ...
//
// NEVER-SEND LIST: ~/_secrets_local_only/email-agent/never-send.txt (one sender address or domain per line, # for comments) plus --never.
// Mail from those senders is not sent to the model, not moved, and gets no task: it stays in the inbox for you.
// What the model sees per message: sender, subject, date and a ~220-character preview. Never attachments, never the full body.
// Where mail goes (apply): needs you -> task + Dashboard/Waiting; worth keeping for records -> Dashboard/Records; nothing to do -> Dashboard/Handled.
// Left in the inbox: never-send senders, starred mail, "needs you" with no deadline (unless --include-whenever), anything the model could not read.
// Nothing is deleted, sent, flagged or marked read. Every move goes in an undo list first.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { connect, scanInbox, classify, ensureFolder, chunks, readEnv } from "./icloud-file.mjs";
import { suspicion } from "./phish-lib.mjs";
import { systemPrompt, loadKey, ask, loadCache, saveCache } from "./email-triage-lib.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ASK = args.includes("--ask"), APPLY = args.includes("--apply");
const MONTHS = parseInt(opt("--months") || "12", 10);
const LIMIT = opt("--limit") ? parseInt(opt("--limit"), 10) : Infinity;
const MODEL_LIMIT = parseInt(opt("--model-limit") || "300", 10);
const TASK_DAYS = parseInt(opt("--task-days") || "21", 10);   // older "needs you" mail is not turned into a task; it stays in the inbox
const INCLUDE_WHENEVER = args.includes("--include-whenever");
const MODEL = opt("--model") || "claude-haiku-5-5";
const API = opt("--anthropic-url") || "https://api.anthropic.com/v1/messages";
const PRICE_IN = 0.10, PRICE_OUT = 0.50;   // per million tokens, Haiku 5.5
const WIN = (opt("--window") || "0-9999").split("-").map((x) => parseInt(x, 10));
const WIN_NEW_MS = Date.now() - (WIN[0] || 0) * 30.44 * 86400_000, WIN_OLD_MS = Date.now() - (WIN[1] || 9999) * 30.44 * 86400_000;
const keepSenders = (opt("--keep") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const secrets = join(homedir(), "_secrets_local_only");
const neverFile = join(secrets, "email-agent", "never-send.txt");
const neverList = [...(existsSync(neverFile) ? readFileSync(neverFile, "utf8").split("\n") : []), ...(opt("--never") || "").split(",")].map((l) => l.replace(/#.*/, "").trim().toLowerCase()).filter(Boolean);
export const isNever = (m) => neverList.some((k) => m.address === k || m.domain === k || m.domain.endsWith("." + k));

export const FOLDERS = { suspicious: "Dashboard/Suspicious", waiting: "Dashboard/Waiting", records: "Dashboard/Records", handled: "Dashboard/Handled" };
const PV = 2;   // prompt version: answers saved under an older prompt are asked again
const EXTRA = `
TASK RULE (strict, the household hates unnecessary tasks): needs_action is true ONLY when a real person is waiting for Ryan's reply, money is due or has failed (declined card, past-due bill, payment failed), a form, signature or deadline comes from a known organization, or a decision has a real deadline. Automated notices are NOT tasks: sign-in alerts, "was this you" checks, password or app-password confirmations, balance or spending alerts, progress reports, newsletters, document-signing notices, invitations to a portal. For those answer needs_action false, kind "fyi", urgency "whenever", and set keep true only if the information is worth filing.
This mailbox is being sorted for a household records system, so ALSO answer these two extra fields in the same JSON object:
"keep": true|false  (true when the email holds information the household may need later even if nothing must be done now: a confirmation, booking, warranty, policy or account detail, school, medical, tax, legal or insurance document, a statement notice, a one-off purchase. false for marketing, newsletters, social notifications, codes and noise)
"subscription": null or {"service": "<name>", "amount": <number or null>, "cycle": "weekly"|"monthly"|"yearly"|null}  (only when the email shows a recurring paid service: a renewal, a recurring receipt, a plan change, a trial ending, a price change. null otherwise)`;
export const triageSystem = (today) => systemPrompt(today) + EXTRA;

// Pure: turn one cached model answer into a destination. Returns { act: "task"|"records"|"handled"|"stay", why }.
export function decideFromAnswer(d, { includeWhenever = false, ageDays = 0, taskDays = 21 } = {}) {
  if (!d) return { act: "stay", why: "not judged" };
  const wantsAction = d.needs_action && ["reply", "do", "decide"].includes(d.kind);
  if (wantsAction && ageDays > taskDays) return { act: "stay", why: `needs you, but ${Math.round(ageDays)} days old (left in the inbox)` };
  if (wantsAction && (includeWhenever || d.urgency !== "whenever")) return { act: "task", why: d.title || d.why || "" };
  if (wantsAction) return { act: "stay", why: "needs you, no deadline (left in the inbox)" };
  if (d.keep || d.subscription) return { act: "records", why: d.why || "worth keeping" };
  return { act: "handled", why: d.why || "nothing to do" };
}
const keyOf = (r) => r.messageId || `icloud:${r.date}:${r.subject}`.slice(0, 200);

const htmlText = (t) => t.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
const noCss = (t) => t.replace(/@[a-z-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, " ").replace(/[.#a-z][\w .#,>:\-\[\]="']*\{[^{}]*\}/gi, " ").replace(/\{[^{}]*\}/g, " ");
function findPart(node) {            // first text/plain part in a body structure, else first text/html
  const flat = []; (function walk(n) { if (!n) return; if (n.childNodes?.length) n.childNodes.forEach(walk); else flat.push(n); })(node);
  const t = flat.find((n) => /^text\/plain$/i.test(n.type || "")) || flat.find((n) => /^text\/html$/i.test(n.type || ""));
  return t ? { part: t.part || "1", html: /html/i.test(t.type) } : null;
}
async function preview(c, uid) {
  try {
    const one = await c.fetchOne(uid, { bodyStructure: true }, { uid: true });
    const p = findPart(one?.bodyStructure) || { part: "1", html: false };
    const { content } = await c.download(uid, p.part, { uid: true, maxBytes: 40000 });
    const parts = []; for await (const ch of content) parts.push(ch);
    const raw = Buffer.concat(parts).toString("utf8");
    return noCss(p.html ? htmlText(raw) : raw).replace(/\s+/g, " ").replace(/^(view (this email )?in (your )?browser|having trouble viewing)[^.]*\.?/i, "").trim().slice(0, 600);
  } catch { return ""; }
}

async function main() {
  const undoDir = join(secrets, "email-agent", "undo"); mkdirSync(undoDir, { recursive: true });
  const { c, user } = await connect();
  try {
    const lock = await c.getMailboxLock("INBOX");
    try {
      const rows = await scanInbox(c);
      const cands = rows.filter((r) => r.date <= WIN_NEW_MS && r.date >= WIN_OLD_MS).map((r) => ({ ...r, cls: classify(r, { months: MONTHS, keep: keepSenders }) })).filter((r) => (r.cls.to === null && /needs a person/.test(r.cls.why)) || r.cls.to === "suspicious");
      const sus = cands.filter((r) => r.cls.to === "suspicious"), never = cands.filter((r) => r.cls.to !== "suspicious" && isNever(r)), eligible = cands.filter((r) => r.cls.to !== "suspicious" && !isNever(r));
      const cache = loadCache(`icloud-${user}`);
      const UNCLEAR = /preview|unclear|too short|cut off|only html|css|markup|empty/i;
      const isStale = (d) => !d || d.v !== PV || (!d.retried && UNCLEAR.test(`${d.why || ""} ${d.title || ""}`));   // an answer that said "preview unclear" gets one more try with the better preview
      const fresh = eligible.filter((r) => isStale(cache[keyOf(r)]));
      console.log(`${user}: ${rows.length} in the inbox; ${cands.length} in this window need a judgment (the free rules could not place them).`);
      console.log(`  suspicious (never sent to the model, never a task): ${sus.length}${sus.length ? `   e.g. ${sus.slice(0, 4).map((r) => `${r.address} (${r.cls.why})`).join(" | ")}` : ""}`);
      if (sus.length) { const bd = {}; for (const r of sus) { const k = `${r.domain} | ${r.cls.why}`; bd[k] = (bd[k] || 0) + 1; } console.log("  flagged senders (check for real ones; they go to Dashboard/Suspicious, undoable):"); for (const [k, n] of Object.entries(bd).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`      ${String(n).padStart(3)}  ${k.slice(0, 120)}`); }
      console.log(`  never-send list: ${neverList.length} entries; ${never.length} of these messages are kept out of the model and stay in your inbox.`);
      console.log(`  already judged (cached): ${eligible.length - fresh.length}; to ask the model: ${fresh.length}.`);
      const est = fresh.length * (950 * PRICE_IN + 350 * PRICE_OUT) / 1e6;
      console.log(`  estimated cost for those: about $${est.toFixed(3)} (Haiku 5.5, sender + subject + date + ~220-character preview each).`);
      if (!ASK && !APPLY) {
        const by = {}; for (const r of fresh) by[r.domain] = (by[r.domain] || 0) + 1;
        const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 15);
        if (top.length) console.log(`\nSenders in this slice (anyone who should NEVER be sent to the model goes in ${neverFile}):\n${top.map(([d, n]) => `  ${String(n).padStart(4)}  ${d}`).join("\n")}`);
      }

      if (ASK) {
        const key = loadKey();
        if (!key) { console.error(`STOP: ANTHROPIC_API_KEY not found in ${join(secrets, "family-dashboard.env")}`); process.exit(2); }
        const today = new Date().toISOString().slice(0, 10), batch = fresh.slice(0, MODEL_LIMIT);
        console.log(`\nAsking the model about ${batch.length} messages (never-send senders excluded).`);
        let inTok = 0, outTok = 0, bad = 0, i = 0;
        for (const r of batch) {                                        // previews are fetched one at a time on the open connection
          const snippet = await preview(c, r.uid);
          const a = await ask({ name: "", address: r.address, date: new Date(r.date).toISOString().slice(0, 10), subject: r.subject, snippet }, { key, api: API, model: MODEL, today, system: triageSystem(today) }).catch(() => null);
          if (a?.out) { inTok += a.inTok; outTok += a.outTok; cache[keyOf(r)] = { ...a.out, topic: String(a.out.topic || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40), v: PV, unclear: /preview|unclear|too short|cut off|only html|css/i.test(`${a.out.why} ${a.out.title}`), retried: !!cache[keyOf(r)], at: today, from: r.address, subject: r.subject.slice(0, 120) }; }
          else bad++;
          if (++i % 25 === 0) { saveCache(`icloud-${user}`, cache); console.log(`  asked ${i}/${batch.length}`); }
        }
        saveCache(`icloud-${user}`, cache);
        console.log(`  done: ${batch.length - bad} answered, ${bad} unreadable (left alone); ${inTok} tokens in, ${outTok} out, about $${((inTok * PRICE_IN + outTok * PRICE_OUT) / 1e6).toFixed(3)}.`);
      }

      // ---- batch review: what the cached answers would do ----
      const cur = (r) => (cache[keyOf(r)]?.v === PV ? cache[keyOf(r)] : null);
      const plan = eligible.map((r) => ({ r, d: cur(r), ...decideFromAnswer(cur(r), { includeWhenever: INCLUDE_WHENEVER, ageDays: (Date.now() - r.date) / 86400_000, taskDays: TASK_DAYS }) }));
      const groups = { task: [], records: [], handled: [], stay: [] }; for (const p of plan) groups[p.act].push(p);
      if (plan.some((p) => p.d)) {
        console.log("\nBATCH REVIEW (from the saved answers):");
        const show = (label, l, f) => { console.log(`  ${label}: ${l.length}`); for (const p of l.slice(0, 12)) console.log(`      ${f(p)}`); if (l.length > 12) console.log(`      … and ${l.length - 12} more`); };
        show("NEEDS YOU → task + Dashboard/Waiting", groups.task, (p) => `${p.d.urgency === "now" ? "NOW " : "soon"} ${p.r.address.slice(0, 28).padEnd(28)} ${p.why.slice(0, 60)}`);
        show("KEEP FOR RECORDS → Dashboard/Records", groups.records, (p) => `${p.r.address.slice(0, 28).padEnd(28)} ${p.r.subject.slice(0, 55)}`);
        show("NOTHING TO DO → Dashboard/Handled", groups.handled, (p) => `${p.r.address.slice(0, 28).padEnd(28)} ${p.r.subject.slice(0, 55)}`);
        show("STAYS IN THE INBOX", groups.stay, (p) => `${p.r.address.slice(0, 28).padEnd(28)} ${p.why}`);
        const subs = new Map();
        for (const p of plan.filter((x) => x.d?.subscription?.service)) {
          const sv = p.d.subscription, k = String(sv.service).toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
          const g = subs.get(k) || { name: String(sv.service).replace(/\s*\(.*$/, ""), n: 0, amount: null, cycle: null, from: p.r.address, last: 0 };
          g.n++; g.amount = g.amount ?? sv.amount ?? null; g.cycle = g.cycle || sv.cycle || null; g.last = Math.max(g.last, p.r.date); subs.set(k, g);
        }
        if (subs.size) { console.log(`\nINFERRED SUBSCRIPTIONS, grouped (${subs.size} services; your test of the system):`); for (const g of [...subs.values()].sort((a, b) => b.n - a.n).slice(0, 45)) console.log(`      ${g.name.slice(0, 30).padEnd(30)} ${String(g.n).padStart(3)}x  ${g.amount != null ? "$" + g.amount : "$?"}  ${g.cycle || "?"}   last ${new Date(g.last).toISOString().slice(0, 10)}  (${g.from})`); }
      }
      if (!APPLY) { console.log(ASK ? "\nNothing else changed. Review the lists above; add anyone to the never-send file and re-run --ask, or run with --apply." : "\nDRY RUN: nothing sent, nothing changed. Add --ask to send the eligible ones to the model."); return; }

      // ---- apply: cached answers only ----
      const todo = [...sus.map((r) => ({ r, act: "suspicious" })), ...plan.filter((p) => p.act !== "stay")].sort((a, b) => b.r.date - a.r.date).slice(0, LIMIT);   // newest first, all kinds mixed
      if (!todo.length) { console.log("\nNothing to apply (no cached answers for this slice? run with --ask first)."); return; }
      const env = readEnv(join(secrets, "family-dashboard.env"));
      const SB = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SK = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      const rest = async (method, path, body, extra = {}) => {
        for (let t = 1; ; t++) {
          try {
            const res = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
            const txt = await res.text(); if (!res.ok) throw Object.assign(new Error(`${method} ${path.split("?")[0]} → ${res.status} ${txt.slice(0, 200)}`), { http: true });
            return txt ? JSON.parse(txt) : null;
          } catch (e) { if (e.http || t >= 4) throw e; await new Promise((ok) => setTimeout(ok, 1500 * t)); }
        }
      };
      const tasksWanted = todo.filter((p) => p.act === "task");
      let person = null;
      if (tasksWanted.length) { if (!SB || !SK) { console.error("STOP: no Supabase keys in family-dashboard.env"); process.exit(2); } person = (await rest("GET", `profiles?display_name=eq.Ryan&select=id`))?.[0]?.id; if (!person) { console.error("STOP: no profile named Ryan"); process.exit(2); } }
      const byTopic = new Map();
      for (const p of tasksWanted) { const k = p.d.topic ? `topic:${p.d.topic}` : `msg:${keyOf(p.r)}`; (byTopic.get(k) || byTopic.set(k, []).get(k)).push(p); }
      let made = 0, kept = 0;
      for (const [k, list] of byTopic) {
        list.sort((a, b) => b.r.date - a.r.date);
        const { r, d } = list[0], n = list.length, mk = `email:${user}:${k}`;
        const ex = await rest("GET", `tasks?merge_key=eq.${encodeURIComponent(mk)}&select=id,status`);
        if (!ex.length) {
          const due = d.urgency === "now" ? new Date().toISOString() : new Date(Date.now() + 3 * 86400_000).toISOString();
          const row = await rest("POST", "tasks", { merge_key: mk, kind: d.kind, tier: 2, origin_kind: "email", origin_ref: null, due_at: due, person,
            title: `${String(d.title || r.subject || "(no subject)").slice(0, 80)}${n > 1 ? ` (×${n})` : ""}`, summary: `${d.why || ""} (from ${r.address} · no links kept from the email, open it in Mail yourself; ${new Date(r.date).toISOString().slice(0, 10)}; moved to Waiting in iCloud Mail)`.slice(0, 300),
            origins: list.slice(0, 50).map((x) => ({ kind: "email", account: user, messageId: x.r.messageId, date: new Date(x.r.date).toISOString() })) }, { Prefer: "return=representation" });
          await rest("POST", "activity_log", { actor: "icloud-triage", action: "task_suggested", subject: String(d.title || r.subject).slice(0, 200), ref: row[0].id, undoable: false });
          made++;
        } else if (ex[0].status === "open") kept++;
        else list.forEach((x) => { x.act = "handled"; });                 // you already closed this one
      }
      console.log(`\nTasks: ${made} created, ${kept} already open.`);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const undoFile = join(undoDir, `icloud-triage-${stamp}.json`);
      const log = { account: user, at: new Date().toISOString(), moves: [] };
      writeFileSync(undoFile, JSON.stringify(log));
      const dest = (p) => (p.act === "suspicious" ? FOLDERS.suspicious : p.act === "task" ? FOLDERS.waiting : p.act === "records" ? FOLDERS.records : FOLDERS.handled);
      for (const f of new Set(todo.map(dest))) await ensureFolder(c, f);
      let moved = 0;
      for (const f of new Set(todo.map(dest))) {
        for (const g of chunks(todo.filter((p) => dest(p) === f), 100)) {
          const res = await c.messageMove(g.map((p) => p.r.uid).join(","), f, { uid: true });
          for (const p of g) log.moves.push({ to: f, messageId: p.r.messageId, srcUid: p.r.uid, destUid: res?.uidMap?.get(p.r.uid) ?? null });
          writeFileSync(undoFile, JSON.stringify(log)); moved += g.length; console.log(`  moved ${moved}/${todo.length}`);
        }
      }
      // tell the app how many messages sit in Dashboard/Suspicious (a count only: no senders, no subjects)
      try {
        const st = await c.status(FOLDERS.suspicious, { messages: true }).catch(() => null);
        if (SB && SK) {
          const n = st?.messages ?? 0;
          await rest("POST", "system_status?on_conflict=key", [{ key: "mail_suspicious", state: "ok", summary: n ? `${n} message${n === 1 ? "" : "s"} held as suspicious. Open Mail › Dashboard › Suspicious to look. Nothing in there was opened, sent to the model, or made a task.` : "No messages held as suspicious.", value_num: n, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" });
        }
      } catch { /* the status line is a convenience; the move already happened */ }
      console.log(`\nDone: ${moved} moved. Undo with:\n  node scripts/icloud-file.mjs --undo ${undoFile}`);
    } finally { lock.release(); }
  } finally { try { await c.logout(); } catch { /* closed */ } }
}

if (process.argv[1] && process.argv[1].endsWith("icloud-triage.mjs")) main().catch((e) => { console.error(e.message || e); process.exit(1); });
