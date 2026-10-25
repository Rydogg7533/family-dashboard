#!/usr/bin/env node
// Missing-receipt matcher. Run by hand on the Mac mini (a scheduled run comes later). No model, no dependencies: Node 20+.
//
//   node scripts/tx-match.mjs                        # DRY RUN (default): counts and a per-month table, writes nothing
//   node scripts/tx-match.mjs --apply                # writes the links and notes, then verifies in the database
//   node scripts/tx-match.mjs --apply --since 2026-10-01   # also write "No receipt found" notes, for charges on/after this date only
//
// For every charge that is still "unknown" (a purchase: positive amount, no receipt linked):
//   1. EXACT   same amount to the cent, date within 3 days, compatible vendor → link receipt and charge both ways, status "matched".
//   2. NEAR    same vendor, date within 3 days, amount close but different → a note "Possible receipt" on the charge. Never linked silently.
//   3. LAST CHANCE  the same amount within 7 days anywhere (receipts, email sightings, Inbox items), whatever the vendor says → a note.
//   4. NONE    inside the period the receipt sources cover, older than 3 days → counted. A "No receipt found" note is written ONLY for charges
//              on/after an explicit --since date (receipt evidence can be sparse for a period; never flag a whole history by default).
// Rules: only the charge's `flag` (and `searched`) is written, and only when the flag is empty or already starts with "[match]";
// a person's own flag is never touched. Nothing is deleted; receipts and charges are only linked. Re-running is safe.
// Refunds and deposits (negative amounts) need no receipt. Charges that look like transfers or card payments are counted and left alone.
// Output is counts and dates only: no vendor, amount or description.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { planMatches, nearCandidates, lastChance, likelyTransfer, dayGap } from "./tx-match-lib.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const SINCE = opt("--since");
const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };
if (SINCE && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) die("--since needs YYYY-MM-DD");
const TAG = "[match] ";

const env = {};
try { for (const line of readFileSync(join(homedir(), "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* below */ }
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) die("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in ~/_secrets_local_only/family-dashboard.env");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function all(path) { const out = []; for (let off = 0; ; off += 1000) { const page = await rest("GET", `${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${off}`); out.push(...page); if (page.length < 1000) break; } return out; }
const num = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
const SEARCHED = ["receipts", "email sightings", "Inbox"];

async function main() {
  console.log(`MISSING-RECEIPT MATCHER — ${APPLY ? "APPLY" : "DRY RUN (nothing will be written)"}\n`);
  const today = new Date().toISOString().slice(0, 10);
  const allTx = await all("transactions?select=id,account_id,amount,merchant,date,category,status,matched_receipt,flag,searched&order=date.asc");
  const open = allTx.filter((t) => t.status === "unknown" && !t.matched_receipt && Number(t.amount) > 0);
  const refunds = allTx.filter((t) => Number(t.amount) <= 0).length;
  const transfers = open.filter((t) => likelyTransfer(t.category, t.merchant));
  const need = open.filter((t) => !likelyTransfer(t.category, t.merchant));

  const receiptsAll = await all("receipts?select=id,merchant,amount,date,transaction_id,status&duplicate_of=is.null");
  const receipts = receiptsAll.filter((r) => !r.transaction_id && r.status !== "matched");
  const sightings = (await all("recurring_observations?select=merchant_key,observed_on,amount&source=eq.receipt&amount=not.is.null")).map((o) => ({ amount: num(o.amount), date: o.observed_on, label: o.merchant_key }));
  const inboxRows = (await all("inbox_items?select=id,read_result,filed&read_result=not.is.null")).filter((i) => !i.filed).map((i) => ({ amount: num(i.read_result?.amount), date: i.read_result?.date, label: i.read_result?.vendor })).filter((r) => r.amount !== null && r.date);
  const pools = [{ name: "receipts", rows: receipts.map((r) => ({ amount: Number(r.amount), date: r.date, label: r.merchant })) }, { name: "email sightings", rows: sightings }, { name: "Inbox", rows: inboxRows }];

  const evidenceDates = [...receiptsAll.map((r) => r.date), ...sightings.map((s) => s.date), ...inboxRows.map((r) => r.date)].filter(Boolean).map((d) => String(d).slice(0, 10)).sort();
  const winFrom = SINCE && evidenceDates.length && SINCE > evidenceDates[0] ? SINCE : evidenceDates[0], winTo = evidenceDates[evidenceDates.length - 1];

  // 1 exact
  const { matches, ambiguous } = planMatches(need, receipts);
  const matchedTx = new Set(matches.map((m) => m.tx.id));
  const rest1 = need.filter((t) => !matchedTx.has(t.id));
  const usedR = new Set(matches.map((m) => m.receipt.id));
  const freeReceipts = receipts.filter((r) => !usedR.has(r.id));
  // 2 near, 3 last chance, 4 none
  const finalPools = [{ name: "receipts", rows: freeReceipts.map((r) => ({ amount: Number(r.amount), date: r.date, label: r.merchant })) }, pools[1], pools[2]];   // receipts already linked above are not evidence again
  const plan = new Map();   // tx id → flag text (or null = clear our own flag)
  let near = 0, lc = 0, none = 0, noneWritten = 0, outside = 0, tooNew = 0; const lcBy = {};
  for (const t of rest1) {
    const n = nearCandidates(t, freeReceipts);
    if (n.length) { near++; plan.set(t.id, { flag: `${TAG}Possible receipt, amount differs: ${n[0].merchant}, ${String(n[0].date).slice(0, 10)}`, search: true }); continue; }
    const hits = lastChance(t, finalPools);
    if (hits.length) { lc++; for (const p of new Set(hits.map((h) => h.pool))) lcBy[p] = (lcBy[p] || 0) + 1; const h = hits[0]; plan.set(t.id, { flag: `${TAG}Same amount seen in ${h.pool} on ${h.date}${h.label ? ` (${h.label})` : ""}, vendor differs`, search: true }); continue; }
    const d = String(t.date).slice(0, 10);
    if (!evidenceDates.length || d < winFrom || d > winTo) { outside++; plan.set(t.id, { flag: null, search: false }); continue; }
    if (dayGap(d, today) <= 3) { tooNew++; plan.set(t.id, { flag: null, search: false }); continue; }
    none++; if (SINCE && d >= SINCE) { noneWritten++; plan.set(t.id, { flag: `${TAG}No receipt found`, search: true }); } else plan.set(t.id, { flag: null, search: false });   // never mass-flag: only from an explicit --since date
  }

  console.log(`Charges in the app: ${allTx.length}. Refunds/deposits (no receipt needed): ${refunds}. Purchases still open: ${open.length}, of which likely transfers or card payments (left alone): ${transfers.length}. To check: ${need.length}.`);
  console.log(`Evidence: ${receipts.length} unlinked receipts, ${sightings.length} email sightings with an amount, ${inboxRows.length} unfiled Inbox items with an amount. Evidence dates: ${evidenceDates[0] ?? "none"} to ${winTo ?? "none"}.\n`);
  console.log("Result for the charges checked:");
  console.log(`  ${String(matches.length).padStart(5)}  EXACT match: would link receipt and charge both ways (${ambiguous} charges had more than one possible receipt)`);
  console.log(`  ${String(near).padStart(5)}  NEAR match: vendor and date fit, amount differs: would add a "Possible receipt" note`);
  console.log(`  ${String(lc).padStart(5)}  LAST CHANCE: same amount found elsewhere (${Object.entries(lcBy).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}): would add a note`);
  console.log(`  ${String(none).padStart(5)}  NO RECEIPT FOUND, inside the covered period ${winFrom ?? "—"} to ${winTo ?? "—"}: no note is written unless you pass --since YYYY-MM-DD (${noneWritten} would be written with the date you gave)`);
  console.log(`  ${String(outside).padStart(5)}  outside the period any receipt source covers: nothing written (not a miss, just no data yet)`);
  console.log(`  ${String(tooNew).padStart(5)}  charged in the last 3 days: nothing written (the receipt may still arrive)`);

  const byMonth = new Map();
  const mo = (d) => String(d).slice(0, 7), bump = (k, f) => { const o = byMonth.get(k) || { ch: 0, ev: 0, ex: 0 }; o[f]++; byMonth.set(k, o); };
  for (const t of need) bump(mo(t.date), "ch");
  for (const m of matches) bump(mo(m.tx.date), "ex");
  for (const e of [...receiptsAll.map((r) => r.date), ...sightings.map((s) => s.date), ...inboxRows.map((r) => r.date)]) if (e) bump(mo(e), "ev");
  console.log("\nBy month: charges to check | exact matches | evidence rows with an amount (receipts + sightings + Inbox)");
  for (const [k, o] of [...byMonth].sort()) console.log(`  ${k}   ${String(o.ch).padStart(4)}  ${String(o.ex).padStart(4)}  ${String(o.ev).padStart(4)}`);
  console.log("\nA month with many charges and few evidence rows is a data gap, not a miss. Read the miss rate only for months where evidence is dense.");

  if (!APPLY) { console.log("\nDry run only. Nothing was written. To write: add --apply"); return; }

  // ---------- apply ----------
  let linked = 0, skippedLink = 0, noted = 0, cleared = 0;
  for (const m of matches) {
    const rr = await rest("PATCH", `receipts?id=eq.${m.receipt.id}&transaction_id=is.null`, { transaction_id: m.tx.id, status: "matched" }, { Prefer: "return=representation" });
    if (!rr?.length) { skippedLink++; continue; }
    const tr = await rest("PATCH", `transactions?id=eq.${encodeURIComponent(m.tx.id)}&matched_receipt=is.null`, { matched_receipt: m.receipt.id, status: "matched", flag: m.tx.flag && String(m.tx.flag).startsWith(TAG) ? null : m.tx.flag ?? null }, { Prefer: "return=representation" });
    if (!tr?.length) { await rest("PATCH", `receipts?id=eq.${m.receipt.id}&transaction_id=eq.${encodeURIComponent(m.tx.id)}`, { transaction_id: null, status: m.receipt.status }, { Prefer: "return=minimal" }); skippedLink++; continue; }   // undo half-link
    linked++;
  }
  const byId = new Map(allTx.map((t) => [t.id, t]));
  for (const [id, p] of plan) {
    const t = byId.get(id), cur = t.flag ?? null, ours = cur === null || String(cur).startsWith(TAG);
    if (!ours) continue;                                   // a person's own flag is never touched
    const want = p.flag, since = SINCE && String(t.date).slice(0, 10) < SINCE && p.flag === `${TAG}No receipt found` ? null : want;
    const body = {}; if (since !== cur) body.flag = since;
    if (p.search && since) { const s = new Set([...(t.searched || []), ...SEARCHED]); if (s.size !== (t.searched || []).length) body.searched = [...s]; }
    if (!Object.keys(body).length) continue;
    await rest("PATCH", `transactions?id=eq.${encodeURIComponent(id)}`, body, { Prefer: "return=minimal" });
    if (since) noted++; else cleared++;
  }

  // ---------- verify in the database ----------
  const tx2 = await all("transactions?select=id,matched_receipt,status&matched_receipt=not.is.null");
  const rc2 = await all("receipts?select=id,transaction_id,status&transaction_id=not.is.null");
  const rById = new Map(rc2.map((r) => [r.id, r]));
  const tById = new Map(tx2.map((t) => [t.id, t]));
  let bad = 0;
  for (const t of tx2) { const r = rById.get(t.matched_receipt); if (!r || r.transaction_id !== t.id || r.status !== "matched" || t.status !== "matched") bad++; }
  for (const r of rc2) { const t = tById.get(r.transaction_id); if (!t || t.matched_receipt !== r.id) bad++; }
  const dupLinks = tx2.length - new Set(tx2.map((t) => t.matched_receipt)).size;
  console.log(`\nWRITTEN: ${linked} linked (${skippedLink} skipped because the receipt or charge was already linked), ${noted} notes added or updated, ${cleared} of our notes cleared.`);
  console.log(`VERIFIED in the database: ${tx2.length} charges linked to receipts, ${rc2.length} receipts linked to charges; ${bad} one-sided or inconsistent links; ${dupLinks} receipts claimed by more than one charge.`);
  if (bad || dupLinks) { console.log("NOT VERIFIED. Paste this output back to Claude."); process.exit(1); }
  console.log("All verified. Nothing was deleted.");
}
main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
