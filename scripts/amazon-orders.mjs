#!/usr/bin/env node
// Amazon order reader (iCloud mailbox). Run by hand on the Mac mini. Rules only, NO model. Needs Node 20+ and the same modules as icloud-find.mjs.
//
//   node scripts/amazon-orders.mjs                  # DRY RUN (default): lists the orders it found; writes nothing
//   node scripts/amazon-orders.mjs --apply          # creates an "expecting charge" receipt for each new order, then verifies
//   node scripts/amazon-orders.mjs --days 200       # how far back to look (default 120)
//
// Reads "Ordered N items" confirmations from auto-confirm@amazon.com in EVERY iCloud folder (folders opened read-only, nothing marked read, moved or sent).
// For each order it takes the order number, the Grand Total, and the day the order was placed (Utah time). Item names and prices are not in these
// emails, so none are read. Each new order becomes ONE receipt: merchant "Amazon", the order total, status "expecting_charge", external_ref
// "amazon:<order number>". Re-running never creates a second one (the order number is unique) and never changes an existing receipt.
// A card may charge per shipment, so one order's total can show up as several smaller charges; that sum-of-shipments match is not built yet.
// Output: order numbers, dates and totals only.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { dir } from "./email-lib.mjs";
import { parseAmazonOrders, denverDate } from "./amazon-orders-lib.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const DAYS = Number(opt("--days") || 120);
const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };
if (!Number.isFinite(DAYS) || DAYS < 1) die("--days needs a number");

const readEnv = (p) => { const e = {}; if (existsSync(p)) for (const l of readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return e; };
const mail = readEnv(join(dir, "icloud-ryan.env"));
if (!mail.ICLOUD_MAIL_USER || !mail.ICLOUD_MAIL_APP_PASSWORD) die(`iCloud credentials not found in ${join(dir, "icloud-ryan.env")}`);
const app = readEnv(join(homedir(), "_secrets_local_only", "family-dashboard.env"));
const URL = app.SUPABASE_URL || app.NEXT_PUBLIC_SUPABASE_URL, KEY = app.SUPABASE_SERVICE_KEY || app.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) die("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in ~/_secrets_local_only/family-dashboard.env");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log(`AMAZON ORDER READER — ${APPLY ? "APPLY" : "DRY RUN (nothing will be written)"} — iCloud, last ${DAYS} days\n`);
  const since = new Date(Date.now() - DAYS * 86400000);
  const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: mail.ICLOUD_MAIL_USER, pass: mail.ICLOUD_MAIL_APP_PASSWORD }, logger: false });
  await c.connect();
  const orders = new Map();      // order number → { order, total, listed, date, folder }
  let emails = 0, noOrder = 0, noTotal = 0;
  try {
    for (const b of await c.list()) {
      if (b.flags?.has("\\Noselect")) continue;
      const lock = await c.getMailboxLock(b.path, { readOnly: true });
      try {
        const uids = c.mailbox.exists ? await c.search({ from: "auto-confirm@amazon.com", since }, { uid: true }) : [];
        if (!uids.length) continue;
        for await (const m of c.fetch(uids.join(","), { uid: true, envelope: true, internalDate: true, source: true }, { uid: true })) {
          emails++;
          const p = await simpleParser(m.source);
          const found = parseAmazonOrders(p.text || "");
          if (!found.length) { noOrder++; continue; }
          const date = denverDate(m.envelope?.date || m.internalDate);
          for (const o of found) {
            if (o.total === null) { noTotal++; continue; }
            const prev = orders.get(o.order);
            if (!prev) orders.set(o.order, { ...o, date, folder: b.path });
            else if (date < prev.date) orders.set(o.order, { ...o, date, folder: b.path });     // the earliest email is the order date
          }
        }
      } finally { lock.release(); }
    }
  } finally { await c.logout(); }

  const list = [...orders.values()].sort((a, b) => a.date.localeCompare(b.date));
  const refs = list.map((o) => `amazon:${o.order}`);
  const existing = new Set();
  for (let i = 0; i < refs.length; i += 50) for (const r of await rest("GET", `receipts?select=external_ref&external_ref=in.(${refs.slice(i, i + 50).join(",")})`)) existing.add(r.external_ref);

  console.log(`Amazon order emails read: ${emails}. Orders with a total: ${list.length}. Emails with no order number found: ${noOrder}. Orders seen without a total (skipped): ${noTotal}.\n`);
  console.log("Orders (order date, order number, total, shipments listed, status):");
  for (const o of list) console.log(`  ${o.date}  ${o.order}  $${o.total.toFixed(2).padStart(8)}  ${o.listed} listed   ${existing.has(`amazon:${o.order}`) ? "already in the app" : "NEW"}`);
  const fresh = list.filter((o) => !existing.has(`amazon:${o.order}`));
  console.log(`\n${fresh.length} new, ${list.length - fresh.length} already in the app.`);
  if (!APPLY) { console.log("\nDry run only. Nothing was written. To create the receipts: add --apply"); return; }

  const rows = fresh.map((o) => ({ merchant: "Amazon", amount: o.total, date: o.date, source: "email", status: "expecting_charge", entity: "Personal", captured_by: "System (email, Ryan's iCloud, Amazon order)", external_ref: `amazon:${o.order}` }));
  for (let i = 0; i < rows.length; i += 50) await rest("POST", "receipts?on_conflict=external_ref", rows.slice(i, i + 50), { Prefer: "resolution=ignore-duplicates,return=minimal" });

  // verify in the database
  let present = 0, wrong = 0;
  for (let i = 0; i < refs.length; i += 50) for (const r of await rest("GET", `receipts?select=external_ref,amount,date,status&external_ref=in.(${refs.slice(i, i + 50).join(",")})`)) {
    const o = orders.get(r.external_ref.slice(7)); present++;
    if (!o || Math.abs(Number(r.amount) - o.total) > 0.005) wrong++;
  }
  console.log(`\nCREATED: ${rows.length} receipt(s). VERIFIED in the database: ${present} of ${list.length} orders present; ${wrong} with a different total.`);
  if (present !== list.length || wrong) { console.log("NOT VERIFIED. Paste this output back to Claude."); process.exit(1); }
  console.log("All verified. Nothing in the mailbox was changed, and no existing receipt was touched.");
}
main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
