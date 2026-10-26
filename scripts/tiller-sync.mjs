#!/usr/bin/env node
// Tiller sheet → dashboard `transactions` sync. Run by hand on the Mac mini (a launchd job comes later). No dependencies: Node 20+.
//
//   node scripts/tiller-sync.mjs --account admin@shvr.co            # DRY RUN (default): counts and account mapping only, writes nothing
//   node scripts/tiller-sync.mjs --account admin@shvr.co --apply    # inserts the new accounts and transactions, then verifies
//   node scripts/tiller-sync.mjs --account admin@shvr.co --apply --backfill-hints
//                                       # ALSO fills category_hint on rows already in the database that have none.
//                                       # Touches that one column only; status, note, category and matched receipt stay as they are.
//
// Rules: the sheet is read with GET only (the sign-in is read-only). Each Tiller "Transaction ID" becomes one transactions.id.
// Rows already in the database are never touched (insert-only, "ignore duplicates"), so re-running is safe and never overwrites
// a status, note or matched receipt. Nothing is deleted. Accounts are created only for Tiller accounts that have transactions
// and fit the app's kinds (credit, checking, savings); a loan is skipped and reported. Output shows counts, dates and account
// names only: never a description, an amount, or a balance.
// Amounts: Tiller shows money out as negative; the app stores a purchase as positive, so the sign is flipped on the way in.
// Defaults (change in the app later): owner "Joint", entity "Personal", for_person "Ryan", status "unknown".

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { toDate, parseAmount, appAmount, last4, accountSlug, guessKind, cleanMerchant } from "./tiller-lib.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const BACKFILL_HINTS = args.includes("--backfill-hints");
const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };
const account = (opt("--account") || "").trim().toLowerCase();
const SHEET = opt("--sheet") || "1uCaFIbh5uTHzLZb-wqUs9GDAm1nOQNbFyLDzv6Ynenk";
const secrets = join(homedir(), "_secrets_local_only");
const dir = join(secrets, "email-agent");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) die("pass --account <address>");

// ---------- env + Google login ----------
const env = {};
try { for (const line of readFileSync(join(secrets, "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) die(`SUPABASE_URL / SUPABASE_SERVICE_KEY not found in ${join(secrets, "family-dashboard.env")}`);
let client, tok;
try { const j = JSON.parse(readFileSync(join(dir, "google-oauth-client.json"), "utf8")); client = j.installed || j.web; } catch (e) { die(`cannot read the OAuth client file: ${e.message}`); }
try { tok = JSON.parse(readFileSync(join(dir, `google-${account}.sheets.json`), "utf8")); } catch { die(`no Sheets sign-in for ${account}. Run: node scripts/google-auth.mjs --account ${account} --purpose sheets`); }

let access = null;
async function sheetGet(path) {   // GET only: this script cannot change the sheet
  if (!access) {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: tok.refresh_token, grant_type: "refresh_token" }) });
    const j = await r.json(); if (!r.ok) die(`could not refresh the Google login (${j.error || r.status})`); access = j.access_token;
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(`https://sheets.googleapis.com${path}`, { headers: { Authorization: `Bearer ${access}` } });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1500 * attempt)); continue; }
    const why = await r.json().then((j) => j?.error ? `${j.error.status || ""}: ${String(j.error.message || "").slice(0, 300)}` : "").catch(() => "");
    throw new Error(`Sheets GET → ${r.status}${why ? ` (${why})` : ""}`);
  }
  throw new Error("Sheets: gave up after retries");
}
const tab = async (name) => ((await sheetGet(`/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(`'${name}'!A1:Z5000`)}`)).values) || [];

// ---------- PostgREST ----------
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function allRows(path) { const out = []; for (let off = 0; ; off += 1000) { const page = await rest("GET", `${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${off}`); out.push(...page); if (page.length < 1000) break; } return out; }

// ---------- read the sheet ----------
const idx = (head, re, last = false) => { const hits = head.map((h, i) => (re.test(String(h).trim()) ? i : -1)).filter((i) => i >= 0); return hits.length ? (last ? hits[hits.length - 1] : hits[0]) : -1; };

async function main() {
  console.log(`TILLER SYNC — ${APPLY ? "APPLY" : "DRY RUN (nothing will be written)"} — sheet read as ${account}\n`);
  const rows = await tab("Transactions");
  const head = rows[0] || [];
  const c = { date: idx(head, /^date$/i), desc: idx(head, /^description$/i), cat: idx(head, /^category$/i), amt: idx(head, /^amount$/i), acct: idx(head, /^account$/i), num: idx(head, /^account #$/i), inst: idx(head, /^institution$/i), id: idx(head, /^transaction id$/i), aid: idx(head, /^account id$/i), full: idx(head, /^full description$/i), hint: idx(head, /^category hint$/i) };
  const missing = Object.entries({ Date: c.date, Description: c.desc, Amount: c.amt, Account: c.acct, "Transaction ID": c.id }).filter(([, v]) => v < 0).map(([k]) => k);
  if (missing.length) die(`the Transactions tab is missing column(s): ${missing.join(", ")}. Run tiller-inspect.mjs to see the layout.`);

  // Tiller's own account list (type/class), used only to guess the account kind.
  const meta = new Map();
  try {
    const ar = await tab("Accounts"), ah = ar[0] || [];
    const a = { id: idx(ah, /^account id$/i), type: idx(ah, /^type$/i), klass: idx(ah, /^class$/i), name: idx(ah, /^account$/i, true) };
    for (const r of ar.slice(1)) { const key = a.id >= 0 ? r[a.id] : null; if (key) meta.set(String(key), { type: r[a.type] || "", klass: r[a.klass] || "" }); }
  } catch (e) { console.log(`(Accounts tab not read: ${e.message}; guessing kinds from names)`); }

  if (BACKFILL_HINTS && !APPLY) console.log("(--backfill-hints noted; nothing is written without --apply)\n");
  const skipped = { noId: 0, noDate: 0, noAmount: 0, dupId: 0 };
  const seen = new Set(), tx = [];
  const acctByKey = new Map();   // sheet account key → { name, number, institution, aid, count, kind, id }
  for (const r of rows.slice(1)) {
    const id = String(r[c.id] ?? "").trim(); if (!id) { if (r.some((x) => String(x ?? "").trim())) skipped.noId++; continue; }
    const date = toDate(r[c.date]); if (!date) { skipped.noDate++; continue; }
    const amt = parseAmount(r[c.amt]); if (amt === null) { skipped.noAmount++; continue; }
    if (seen.has(id)) { skipped.dupId++; continue; } seen.add(id);
    const name = String(r[c.acct] ?? "").trim() || "(unnamed account)";
    const aid = c.aid >= 0 ? String(r[c.aid] ?? "").trim() : "";
    const key = aid || name;
    if (!acctByKey.has(key)) acctByKey.set(key, { name, number: c.num >= 0 ? r[c.num] : "", institution: c.inst >= 0 ? String(r[c.inst] ?? "").trim() : "", aid, count: 0 });
    acctByKey.get(key).count++;
    tx.push({ id, key, date, amount: appAmount(amt), merchant: cleanMerchant(r[c.desc], c.full >= 0 ? r[c.full] : ""), category: c.cat >= 0 ? (String(r[c.cat] ?? "").trim() || null) : null, hint: c.hint >= 0 ? (String(r[c.hint] ?? "").trim() || null) : null });
  }

  // Accounts: kind, short id (slug) with collision guard.
  const used = new Set();
  for (const a of acctByKey.values()) {
    const m = meta.get(a.aid) || {};
    a.kind = guessKind({ type: m.type, klass: m.klass, name: `${a.name} ${a.institution}` });
    a.last4 = last4(a.number, a.name);
    let s = accountSlug(a.name, a.last4), n = 2; while (used.has(s)) s = `${accountSlug(a.name, a.last4)}-${n++}`;
    used.add(s); a.id = s;
  }
  const loadable = [...acctByKey.values()].filter((a) => a.kind);
  const skippedAccts = [...acctByKey.values()].filter((a) => !a.kind);
  const keyOk = new Set([...acctByKey].filter(([, a]) => a.kind).map(([k]) => k));
  const toLoad = tx.filter((t) => keyOk.has(t.key));

  const existingAcct = new Set((await rest("GET", "accounts?select=id")).map((x) => x.id));
  const existingTx = new Set((await allRows("transactions?select=id")).map((x) => x.id));
  const fresh = toLoad.filter((t) => !existingTx.has(t.id));

  console.log(`Sheet rows read: ${rows.length - 1}. Usable transactions: ${tx.length}. Skipped: ${skipped.noId} with no Transaction ID, ${skipped.noDate} with no readable date, ${skipped.noAmount} with no readable amount, ${skipped.dupId} repeated IDs.\n`);
  console.log("Accounts (sheet name → app account id, kind guess, last 4, transactions):");
  for (const a of [...acctByKey.values()].sort((x, y) => y.count - x.count)) console.log(`  ${a.kind ? "load " : "SKIP "} ${String(a.count).padStart(5)}  ${(a.kind || "no kind").padEnd(8)} ${a.id.padEnd(44)} last4=${a.last4 || "—"}   «${a.name}»${existingAcct.has(a.id) ? "  (account already exists)" : ""}`);
  if (skippedAccts.length) console.log(`\nSkipped accounts (the app has no kind for them): ${skippedAccts.map((a) => `${a.name} (${a.count})`).join("; ")}`);
  const dates = toLoad.map((t) => t.date).sort();
  console.log(`\nWould load ${toLoad.length} transactions${dates.length ? ` (${dates[0]} to ${dates[dates.length - 1]})` : ""}: ${fresh.length} new, ${toLoad.length - fresh.length} already in the app (left untouched).`);

  if (!APPLY) { console.log("\nDry run only. Nothing was written. To load: add --apply"); return; }

  // ---------- apply ----------
  const newAccts = loadable.filter((a) => !existingAcct.has(a.id)).map((a) => ({ id: a.id, kind: a.kind, institution: a.institution || a.name, last4: a.last4, owner: "Joint", entity: "Personal", source: "Tiller sheet" }));
  if (newAccts.length) await rest("POST", "accounts?on_conflict=id", newAccts, { Prefer: "resolution=ignore-duplicates,return=minimal" });
  const idOf = new Map([...acctByKey].map(([k, a]) => [k, a.id]));
  const payload = fresh.map((t) => ({ id: t.id, account_id: idOf.get(t.key), amount: t.amount, merchant: t.merchant, date: t.date, category: t.category, category_hint: t.hint }));   // uniform keys in every object
  for (let i = 0; i < payload.length; i += 200) await rest("POST", "transactions?on_conflict=id", payload.slice(i, i + 200), { Prefer: "resolution=ignore-duplicates,return=minimal" });

  // ---------- backfill hints on rows that pre-date the column ----------
  // A partial upsert cannot do this: Postgres checks NOT NULL on the proposed row BEFORE it looks for a conflict,
  // so {id, category_hint} alone fails on account_id even when the row exists (seen 2026-10-26). So this is a real
  // UPDATE: PATCH by id list, filtered to rows whose hint is still null (idempotent at the database, not just here),
  // grouped by hint value so every row in a request takes the same body. Touches one column. Prints counts only.
  let hintsFilled = 0;
  if (BACKFILL_HINTS) {
    const have = new Map((await allRows("transactions?select=id,category_hint")).map((x) => [x.id, x.category_hint]));
    const byHint = new Map();
    for (const t of toLoad) if (t.hint && have.has(t.id) && !have.get(t.id)) { if (!byHint.has(t.hint)) byHint.set(t.hint, []); byHint.get(t.hint).push(t.id); }
    for (const [hint, ids] of byHint) {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        await rest("PATCH", `transactions?id=in.(${chunk.map(encodeURIComponent).join(",")})&category_hint=is.null`, { category_hint: hint }, { Prefer: "return=minimal" });
        hintsFilled += chunk.length;
      }
    }
  }

  // ---------- verify against the database, not the command's exit ----------
  const db = await allRows("transactions?select=id,account_id,amount");
  const dbById = new Map(db.map((x) => [x.id, x]));
  let missingRows = 0, wrongAcct = 0, wrongAmt = 0;
  for (const t of toLoad) { const d = dbById.get(t.id); if (!d) { missingRows++; continue; } if (d.account_id !== idOf.get(t.key)) wrongAcct++; if (Math.abs(Number(d.amount) - t.amount) > 0.005) wrongAmt++; }
  const sumSheet = new Map(), sumDb = new Map();
  for (const t of toLoad) sumSheet.set(idOf.get(t.key), (sumSheet.get(idOf.get(t.key)) || 0) + t.amount);
  for (const d of db) if (sumSheet.has(d.account_id)) sumDb.set(d.account_id, (sumDb.get(d.account_id) || 0) + Number(d.amount));
  const sumsMatch = [...sumSheet].every(([k, v]) => Math.abs((sumDb.get(k) || 0) - v) < 0.01);
  console.log(`\nINSERTED: ${newAccts.length} account(s), ${payload.length} transaction(s).`);
  if (BACKFILL_HINTS) {
    const withHint = (await allRows("transactions?select=id&category_hint=not.is.null")).length;
    console.log(`HINTS: filled ${hintsFilled} existing row(s); ${withHint} of ${db.length} transactions now carry a category hint.`);
  }
  console.log(`VERIFIED in the database: ${toLoad.length - missingRows} of ${toLoad.length} sheet transactions present; ${wrongAcct} on the wrong account; ${wrongAmt} with a different amount; per-account totals ${sumsMatch ? "match the sheet" : "DO NOT MATCH the sheet"}.`);
  if (missingRows || wrongAcct || wrongAmt || !sumsMatch) { console.log("NOT VERIFIED. Paste this output back to Claude."); process.exit(1); }
  console.log("All verified. The sheet was only read; nothing in it changed.");
}
main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
