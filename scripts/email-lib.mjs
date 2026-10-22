// Shared by scripts/email-scan.mjs (read-only) and scripts/email-apply.mjs (labels and archive only).
// No dependencies: Node 20+. Keep the rules in step with src/lib/email-funnel.ts.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const dir = join(homedir(), "_secrets_local_only", "email-agent");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };

export function option(args, n) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; }

// One Gmail session for one saved account. `allowWrite: false` makes any non-GET call throw, so a read-only
// script cannot change anything even by mistake. Gmail rate limits (429, or 403 with a rate-limit reason) are retried.
export function openGmail(args, { allowWrite }) {
  const account = (option(args, "--account") || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) die("pass --account <google address>");
  const BASE = option(args, "--api-base") || "https://gmail.googleapis.com";     // test hooks, used only by the offline tests
  const TOKEN_URL = option(args, "--token-url") || "https://oauth2.googleapis.com/token";
  let client, tok;
  try { const j = JSON.parse(readFileSync(option(args, "--client") || join(dir, "google-oauth-client.json"), "utf8")); client = j.installed || j.web; } catch (e) { die(`cannot read the OAuth client file: ${e.message}`); }
  try { tok = JSON.parse(readFileSync(join(dir, `google-${account}.json`), "utf8")); } catch { die(`no saved sign-in for ${account}. Run scripts/google-auth.mjs --account ${account} first.`); }
  let accessToken = null;
  async function refresh() {
    const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: tok.refresh_token, grant_type: "refresh_token" }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`could not refresh the Google login (${j.error || r.status}${j.error === "invalid_grant" ? ": access was revoked or expired; run google-auth.mjs again" : ""})`);
    accessToken = j.access_token;
  }
  async function api(path, { method = "GET", body } = {}) {
    if (method !== "GET" && !allowWrite) throw new Error(`read-only script tried a ${method} call: refused`);
    if (!accessToken) await refresh();
    for (let attempt = 1; attempt <= 8; attempt++) {
      const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (r.ok) { const t = await r.text(); return t ? JSON.parse(t) : {}; }
      if (r.status === 401 && attempt < 3) { await refresh(); continue; }
      let reason = "", detail = "";
      try { const j = await r.json(); reason = j?.error?.errors?.[0]?.reason || j?.error?.status || ""; detail = j?.error?.message || ""; } catch { /* no JSON body */ }
      if (r.status === 429 || r.status >= 500 || /ratelimit|quota|backenderror/i.test(reason)) { await sleep(1000 * attempt ** 2 + Math.random() * 1000); continue; }
      throw new Error(`Gmail ${method} ${path.split("?")[0]} → ${r.status}${reason ? ` [${reason}]` : ""}${detail ? ` ${detail.slice(0, 200)}` : ""}`);
    }
    throw new Error(`Gmail ${path.split("?")[0]}: gave up after retries`);
  }
  return { account, api };
}

// ---------- the free rules ----------
const RECEIPT_RE = /\b(receipt|your order|order confirmation|invoice|payment received|e-?receipt|statement is (ready|available)|your statement)\b/i;
const SHIPPING_RE = /\b(shipped|out for delivery|delivered|tracking)\b/i;
const CODE_RE = /\b(verification code|one-time|security code|sign-in code|2fa)\b/i;
const CALENDAR_RE = /\b(invitation|invite|accepted|declined|tentative):|\.ics\b|calendar invitation/i;
const CONFIRMATION_RE = /\b(confirmation (number|#|code)|reservation (number|#)|booking (reference|number)|rma|return authori[sz]ation|claim (number|#)|case (number|#)|registration confirmed|appointment (confirmed|reminder))\b/i;
const NOREPLY_RE = /^(no-?reply|do-?not-?reply|noreply|notifications?|mailer-daemon|alerts?)@/i;

export function decide(e) {
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

// Subject pattern: numbers, amounts, dates and weekdays stripped, so "the same issue" repeats compare equal.
export const pattern = (s) => s.toLowerCase()
  .replace(/\$?\s?\d[\d,]*(\.\d+)?%?/g, "#")
  .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g, "<mon>")
  .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/g, "<day>")
  .replace(/[^a-z#<>' ]+/g, " ").replace(/\s+/g, " ").trim();

export function parse(msg) {
  const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
  const from = h["from"] || "";
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : from).trim().toLowerCase();
  const labels = msg.labelIds || [];
  const folder = labels.includes("SPAM") ? "spam" : labels.includes("CATEGORY_PROMOTIONS") ? "promotions" : labels.includes("CATEGORY_SOCIAL") ? "social" : labels.includes("CATEGORY_UPDATES") ? "updates" : "inbox";
  return {
    id: msg.id, name: (m ? m[1] : "").trim(), address, domain: address.split("@")[1] || "", labels,
    subject: h["subject"] || "", snippet: msg.snippet || "", folder,
    listUnsubscribe: !!h["list-unsubscribe"], precedenceBulk: /bulk|list|junk/i.test(h["precedence"] || ""), autoSubmitted: !!h["auto-submitted"] && !/^no$/i.test(h["auto-submitted"]),
    ts: Number(msg.internalDate || 0),
    date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString().slice(0, 10) : "",
  };
}

// List ids for a Gmail search, then read each message's headers + snippet with a few parallel readers.
export async function readMessages(api, query, max, { log = () => {}, workers = 3 } = {}) {
  const ids = []; let page = "";
  do {
    const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=500${page ? `&pageToken=${page}` : ""}`);
    for (const m of r.messages || []) { if (ids.length < max) ids.push(m.id); }
    page = ids.length >= max ? "" : r.nextPageToken || "";
  } while (page);
  log(`${ids.length} messages to read${ids.length >= max ? ` (capped at ${max}; use --max for more)` : ""}.`);
  const rows = []; let next = 0, done = 0; const t0 = Date.now();
  const fields = "id,labelIds,snippet,internalDate,payload/headers";
  const hdrs = ["From", "Subject", "List-Unsubscribe", "Precedence", "Auto-Submitted"].map((x) => `metadataHeaders=${x}`).join("&");
  const failed = [];
  const readOne = async (id) => { const e = parse(await api(`/gmail/v1/users/me/messages/${id}?format=metadata&${hdrs}&fields=${encodeURIComponent(fields)}`)); rows.push({ ...e, ...decide(e) }); };
  await Promise.all(Array.from({ length: workers }, async () => {
    for (;;) {
      const i = next++; if (i >= ids.length) return;
      try { await readOne(ids[i]); } catch (e) { failed.push(ids[i]); }   // a message that can't be read now is left alone and retried below
      if (++done % 500 === 0) log(`  ${done}/${ids.length} read · ${Math.round(done / ((Date.now() - t0) / 60000))}/min`);
    }
  }));
  if (failed.length) {
    log(`  ${failed.length} messages hit Gmail's rate limit; pausing 30s, then retrying them one at a time.`);
    await sleep(30000);
    const still = [];
    for (const id of failed) { try { await readOne(id); } catch { still.push(id); await sleep(2000); } }
    rows.unreadable = still.length;
    if (still.length) log(`  ${still.length} messages could not be read; they are left untouched in the inbox.`);
  }
  return rows;
}

// ---------- subscription helpers (shared by the agent and the filer) ----------
// Stable id for a merchant. The sender's own name wins ("Eleven Labs Inc." -> "elevenlabs", even when Stripe sends the mail);
// the domain family is the fallback ("mail.anthropic.com" -> "anthropic").
export function merchantKey(name, domain) {
  const slug = String(name || "").toLowerCase().replace(/\b(inc|llc|ltd|pbc|corp|corporation|co|gmbh|limited|billing|receipts?|invoices?|payments?|team|support|no-?reply)\b\.?/g, "").replace(/[^a-z0-9]+/g, "");
  if (slug.length >= 3) return slug;
  const p = String(domain || "").toLowerCase().split(".").filter(Boolean);
  return p.length >= 2 ? p[p.length - 2] : p[0] || "";
}
// First dollar amount in the subject or preview; null when none is visible.
export const amountOf = (r) => { const m = `${r.subject} ${r.snippet}`.match(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/); return m ? parseFloat(m[1].replace(/,/g, "")) : null; };
// Billing cycle from the typical gap (days) between receipt dates; null when there are too few or the gaps are irregular.
export function cycleOf(dates) {
  const d = [...new Set(dates)].sort().map((x) => Date.parse(x) / 86400000).filter((x) => !Number.isNaN(x));
  if (d.length < 3) return null;
  const gaps = d.slice(1).map((x, i) => x - d[i]).sort((a, b) => a - b), med = gaps[Math.floor(gaps.length / 2)];
  return med >= 5 && med <= 10 ? "weekly" : med >= 25 && med <= 35 ? "monthly" : med >= 340 && med <= 390 ? "yearly" : null;
}
