#!/usr/bin/env node
// Tiller sheet INSPECTOR. Run by hand on the Mac mini. No dependencies: Node 20+. Read-only: only GET calls to Google Sheets.
//
//   node scripts/google-auth.mjs --account admin@shvr.co --purpose sheets      # once: read-only Sheets sign-in
//   node scripts/tiller-inspect.mjs --account admin@shvr.co                    # shows the sheet's tabs, columns and freshness
//
// It prints STRUCTURE ONLY: tab names, column headers, row counts, the date range, and for each account the number of
// transactions and the date of the newest one. It never prints a description, an amount or a balance, and writes nothing
// anywhere (not to Google, not to the app, not to disk). Its job is to show how fresh the Tiller feed is and what the
// columns are called, so the sync can be built against the real layout.
// Default sheet: "Tom Financial Tracking" (override with --sheet <id>).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };
const account = (opt("--account") || "").trim().toLowerCase();
const SHEET = opt("--sheet") || "1uCaFIbh5uTHzLZb-wqUs9GDAm1nOQNbFyLDzv6Ynenk";
const BASE = opt("--api-base") || "https://sheets.googleapis.com";
const TOKEN_URL = opt("--token-url") || "https://oauth2.googleapis.com/token";
const dir = join(homedir(), "_secrets_local_only", "email-agent");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) die("pass --account <address>");

let client, tok;
try { const j = JSON.parse(readFileSync(opt("--client") || join(dir, "google-oauth-client.json"), "utf8")); client = j.installed || j.web; } catch (e) { die(`cannot read the OAuth client file: ${e.message}`); }
try { tok = JSON.parse(readFileSync(join(dir, `google-${account}.sheets.json`), "utf8")); } catch { die(`no Sheets sign-in for ${account}. Run: node scripts/google-auth.mjs --account ${account} --purpose sheets`); }

let access = null;
async function get(path) {
  if (!access) {
    const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: tok.refresh_token, grant_type: "refresh_token" }) });
    const j = await r.json(); if (!r.ok) die(`could not refresh the Google login (${j.error || r.status})`); access = j.access_token;
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${access}` } });   // GET only: this script cannot change the sheet
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1500 * attempt)); continue; }
    throw new Error(`Sheets GET ${path.split("?")[0].split("/").slice(0, 4).join("/")} → ${r.status}${r.status === 404 ? " (wrong sheet id, or this account cannot open it)" : r.status === 403 ? " (this account cannot read that sheet)" : ""}`);
  }
  throw new Error("Sheets: gave up after retries");
}
const col = (n) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const toDate = (v) => { const s = String(v ?? "").trim(); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

async function main() {
  const meta = await get(`/v4/spreadsheets/${SHEET}?fields=properties.title,sheets.properties(title,gridProperties)`);
  console.log(`TILLER SHEET INSPECTION (read-only) — "${meta.properties?.title}" — ${account}\n`);
  for (const sh of meta.sheets || []) {
    const t = sh.properties.title, rows = sh.properties.gridProperties?.rowCount ?? 0, cols = sh.properties.gridProperties?.columnCount ?? 0;
    const head = ((await get(`/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(`'${t}'!1:1`)}`)).values || [[]])[0] || [];
    console.log(`Tab "${t}": ${rows} rows allocated, ${cols} columns`);
    console.log(`  Columns: ${head.length ? head.map((h, i) => `${col(i)}=${h}`).join(" | ") : "(empty first row)"}`);
    const iDate = head.findIndex((h) => /^date$/i.test(h)), iAcct = head.findIndex((h) => /^account$/i.test(h)), iId = head.findIndex((h) => /transaction id/i.test(h));
    if (iDate < 0) { console.log(""); continue; }
    const dates = ((await get(`/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(`'${t}'!${col(iDate)}2:${col(iDate)}`)}?majorDimension=COLUMNS`)).values || [[]])[0] || [];
    const ds = dates.map(toDate).filter(Boolean).sort();
    console.log(`  Transactions: ${ds.length} rows with a date${ds.length ? `, from ${ds[0]} to ${ds[ds.length - 1]}` : ""}${iId >= 0 ? "" : " (no 'Transaction ID' column found)"}`);
    if (iAcct >= 0) {
      const accts = ((await get(`/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(`'${t}'!${col(iAcct)}2:${col(iAcct)}`)}?majorDimension=COLUMNS`)).values || [[]])[0] || [];
      const by = new Map();
      accts.forEach((a, i) => { const d = toDate(dates[i]); if (!a) return; const o = by.get(a) || { n: 0, last: "" }; o.n++; if (d && d > o.last) o.last = d; by.set(a, o); });
      console.log("  By account (name, how many transactions, newest date):");
      for (const [a, o] of [...by].sort((x, y) => y[1].n - x[1].n)) console.log(`    ${String(o.n).padStart(6)}  ${o.last || "—".padEnd(10)}  ${a}`);
    }
    console.log("");
  }
  console.log("Nothing was written anywhere. No descriptions, amounts or balances were printed.");
}
main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
