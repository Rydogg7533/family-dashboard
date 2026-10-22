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
//   - READ-ONLY: every Gmail call is a GET (see api()). No label, archive, move, trash, draft or send call exists
//     in this file. The only POST is Google's token endpoint, to turn the saved refresh token into a short-lived key.
//   - NO MODEL: nothing is sent to Anthropic or anywhere else. Mail the free rules can't place is counted as
//     "would need the model" and left alone.
//   - The report is written only to ~/_secrets_local_only/email-agent/reports/ (mode 600, never cloud-synced).
//     The terminal shows counts and top sender DOMAINS only, no subjects.
//   - Tokens are read from ~/_secrets_local_only/email-agent/google-<account>.json and never printed.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const account = (opt("--account") || "").trim().toLowerCase();
const days = parseInt(opt("--days") || "90", 10);
const MAX = parseInt(opt("--max") || "5000", 10);
const query = opt("--q") || `in:inbox newer_than:${days}d`;
const BASE = opt("--api-base") || "https://gmail.googleapis.com";          // test hooks, used only by the offline test
const TOKEN_URL = opt("--token-url") || "https://oauth2.googleapis.com/token";
const dir = join(homedir(), "_secrets_local_only", "email-agent");
const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) die("pass --account <google address>");

let clientJson, tokenJson;
try { const j = JSON.parse(readFileSync(opt("--client") || join(dir, "google-oauth-client.json"), "utf8")); clientJson = j.installed || j.web; } catch (e) { die(`cannot read the OAuth client file: ${e.message}`); }
try { tokenJson = JSON.parse(readFileSync(join(dir, `google-${account}.json`), "utf8")); } catch { die(`no saved sign-in for ${account}. Run scripts/google-auth.mjs --account ${account} first.`); }

// ---------- Gmail access (GET only) ----------
let accessToken = null;
async function refresh() {
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientJson.client_id, client_secret: clientJson.client_secret, refresh_token: tokenJson.refresh_token, grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`could not refresh the Google login (${j.error || r.status}${j.error === "invalid_grant" ? ": access was revoked or expired; run google-auth.mjs again" : ""})`);
  accessToken = j.access_token;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path) {                       // the ONLY function that talks to Gmail, and it only does GET
  if (!accessToken) await refresh();
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(BASE + path, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
    if (r.ok) return r.json();
    if (r.status === 401 && attempt < 3) { await refresh(); continue; }
    let reason = "", detail = "";
    try { const j = await r.json(); reason = j?.error?.errors?.[0]?.reason || j?.error?.status || ""; detail = j?.error?.message || ""; } catch { /* no JSON body */ }
    // Gmail reports rate limits as 429 or as 403 with a rate-limit reason: wait and retry those.
    if (r.status === 429 || r.status >= 500 || /ratelimit|quota|backenderror/i.test(reason)) { await sleep(1000 * attempt ** 2); continue; }
    throw new Error(`Gmail ${path.split("?")[0]} → ${r.status}${reason ? ` [${reason}]` : ""}${detail ? ` ${detail.slice(0, 200)}` : ""}`);
  }
  throw new Error(`Gmail ${path.split("?")[0]}: gave up after retries`);
}

// ---------- the free rules (kept in step with src/lib/email-funnel.ts) ----------
const RECEIPT_RE = /\b(receipt|your order|order confirmation|invoice|payment received|e-?receipt|statement is (ready|available)|your statement)\b/i;
const SHIPPING_RE = /\b(shipped|out for delivery|delivered|tracking)\b/i;
const CODE_RE = /\b(verification code|one-time|security code|sign-in code|2fa)\b/i;
const CALENDAR_RE = /\b(invitation|invite|accepted|declined|tentative):|\.ics\b|calendar invitation/i;
const CONFIRMATION_RE = /\b(confirmation (number|#|code)|reservation (number|#)|booking (reference|number)|rma|return authori[sz]ation|claim (number|#)|case (number|#)|registration confirmed|appointment (confirmed|reminder))\b/i;
const NOREPLY_RE = /^(no-?reply|do-?not-?reply|noreply|notifications?|mailer-daemon|alerts?)@/i;

function decide(e) {
  if (["spam", "junk", "promotions", "social"].includes(e.folder)) return { stage: "provider", action: "skip", reason: `in ${e.folder}` };
  if (e.listUnsubscribe || e.precedenceBulk) return { stage: "headers", action: "archive", reason: e.listUnsubscribe ? "marketing (List-Unsubscribe)" : "bulk precedence" };
  if (CODE_RE.test(e.subject)) return { stage: "headers", action: "archive", reason: "one-time code" };
  if (CALENDAR_RE.test(e.subject)) return { stage: "calendar", action: "calendar", reason: "calendar invite" };
  if (RECEIPT_RE.test(e.subject)) return { stage: "money", action: "money", reason: "receipt or statement" };
  if (CONFIRMATION_RE.test(e.subject) || CONFIRMATION_RE.test(e.snippet)) return { stage: "record", action: "record", reason: "confirmation" };
  if (SHIPPING_RE.test(e.subject)) return { stage: "headers", action: "fyi", reason: "shipping update" };
  if (NOREPLY_RE.test(e.address) && e.autoSubmitted) return { stage: "headers", action: "archive", reason: "automated no-reply" };
  return { stage: "none", action: "needs-model", reason: "no free rule matched (a person or a new company)" };
}

function parse(msg) {
  const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
  const from = h["from"] || "";
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : from).trim().toLowerCase();
  const labels = msg.labelIds || [];
  const folder = labels.includes("SPAM") ? "spam" : labels.includes("CATEGORY_PROMOTIONS") ? "promotions" : labels.includes("CATEGORY_SOCIAL") ? "social" : labels.includes("CATEGORY_UPDATES") ? "updates" : "inbox";
  return {
    id: msg.id, name: (m ? m[1] : "").trim(), address, domain: address.split("@")[1] || "",
    subject: h["subject"] || "", snippet: msg.snippet || "", folder,
    listUnsubscribe: !!h["list-unsubscribe"], precedenceBulk: /bulk|list|junk/i.test(h["precedence"] || ""), autoSubmitted: !!h["auto-submitted"] && !/^no$/i.test(h["auto-submitted"]),
    date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString().slice(0, 10) : "",
  };
}

async function main() {
  console.log(`READ-ONLY SCAN — ${account} — search: ${query}`);
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);
  console.log(`Mailbox has ${profile.messagesTotal} messages in total; scanning only what matches the search.`);

  const ids = []; let page = "";
  do {
    const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=500${page ? `&pageToken=${page}` : ""}`);
    for (const m of r.messages || []) { if (ids.length < MAX) ids.push(m.id); }
    page = ids.length >= MAX ? "" : r.nextPageToken || "";
  } while (page);
  console.log(`${ids.length} messages to read${ids.length >= MAX ? ` (capped at ${MAX}; use --max for more)` : ""}.`);

  const rows = []; let next = 0, done = 0; const t0 = Date.now();
  const fields = "id,labelIds,snippet,internalDate,payload/headers";
  const hdrs = ["From", "Subject", "List-Unsubscribe", "Precedence", "Auto-Submitted"].map((x) => `metadataHeaders=${x}`).join("&");
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (;;) {
      const i = next++; if (i >= ids.length) return;
      const msg = await api(`/gmail/v1/users/me/messages/${ids[i]}?format=metadata&${hdrs}&fields=${encodeURIComponent(fields)}`);
      const e = parse(msg); rows.push({ ...e, ...decide(e) });
      if (++done % 500 === 0) console.log(`  ${done}/${ids.length} read · ${Math.round(done / ((Date.now() - t0) / 60000))}/min`);
    }
  }));

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
