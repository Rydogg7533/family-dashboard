#!/usr/bin/env node
// Receipts bridge: receipt and statement mail → the app. Run by hand on the Mac mini. Node 20+.
//   node scripts/email-receipts.mjs --account admin@shvr.co                 # DRY RUN (default): counts only, writes nothing
//   node scripts/email-receipts.mjs --account admin@shvr.co --apply         # records sightings, copies attachments into the app Inbox
//   node scripts/email-receipts.mjs --account ryanrossiter@icloud.com --apply   # iCloud (IMAP) works the same way
//   options: --months 12 (how far back; default 12)   --window 12-24 (a slice, in months ago: here the year before last year)   --min-kb 20 (images smaller than this are logos, skipped)
// For every message in the inbox (Gmail: anywhere except spam, trash, sent, drafts; iCloud: INBOX plus Dashboard/Money, Records and Handled, where the triage files
// receipts) that the free rules call "money" (receipt, order, invoice, statement) in the window:
//   1. SIGHTING  one recurring_observations row (source 'receipt', merchant key, date, visible amount, ref = message id). Append-only; a
//                re-run adds nothing twice. This is what Subscriptions reads to spot repeat charges.
//   2. DOCUMENT  each attached PDF or image (the kinds the Inbox reader can read, ≤ 20 MB) is copied into the private "captures" bucket
//                and becomes an Inbox item that asks "Yes, file it", exactly like a phone upload. Dedupe by content hash: an attachment
//                already in the Inbox is skipped, so a re-run is safe.
//   2b. BODY     a money email with NO usable attachment has its text rendered to a PDF and put in the Inbox the same way, so that every
//                charge ends with a document and not just a number (Ryan, 2026-10-29). Rendered from the TEXT, never the HTML: a receipt
//                email's remote images are the sender's tracking pixel, and fetching them would report the mail opened again, months
//                later, from the hub. The bytes are deterministic, so the same email re-rendered is caught by the same hash check.
// The MAILBOX IS NEVER CHANGED: Gmail is opened read-only (any write call throws); iCloud folders are opened EXAMINE with BODY.PEEK.
// Nothing is deleted, nothing is sent, no model is called. Secrets: ~/_secrets_local_only/family-dashboard.env (Supabase) and
// ~/_secrets_local_only/email-agent/ (Gmail tokens, icloud-ryan.env). Never printed.
import { suspicion, authFailed, replyDomainOf } from "./phish-lib.mjs";
import { readFileSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { dir, option, openGmail, parse, decide, merchantKey, amountOf } from "./email-lib.mjs";
import { emailPdf } from "./lib/text-pdf.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
let skippedSus = 0;   // money-looking mail that failed the phishing screen: no sighting, no attachment copied
const account = option(args, "--account"); if (!account) { console.error("STOP: pass --account <address>"); process.exit(2); }
const MONTHS = parseInt(option(args, "--months") || "12", 10);
const MIN_KB = parseInt(option(args, "--min-kb") || "20", 10);
// Window, in months ago: --window 0-12 is the last year; --window 12-24 is the year before. (--months 12 = --window 0-12.)
const WIN = (option(args, "--window") || `0-${MONTHS}`).split("-").map((x) => parseInt(x, 10));
const [WIN_NEW, WIN_OLD] = [WIN[0] || 0, WIN[1] || MONTHS];
const since = new Date(); since.setMonth(since.getMonth() - WIN_OLD);
const before = WIN_NEW > 0 ? (() => { const d = new Date(); d.setMonth(d.getMonth() - WIN_NEW); return d; })() : null;
const WIN_TXT = `${WIN_NEW}-${WIN_OLD} months ago`;
const READABLE = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_BODY = 60_000;        // a rendered receipt is a page or two; a newsletter-length body is truncated, not refused
const MIN_BODY = 40;            // below this there is nothing worth keeping and no document is made

// Last resort when a sender ships HTML only: strip it to something readable. Scripts and styles go first, so their
// contents never appear as text; block tags become newlines so the layout survives roughly.
const stripHtml = (h) => String(h || "")
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<\/(p|div|tr|table|h[1-6]|li|ul|ol)>/gi, "\n")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
  .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

// Gmail hands back the body in base64url, split across parts. Plain text wins; HTML is the fallback.
function gmailBody(payload) {
  let text = "", html = "";
  const walk = (p) => {
    if (!p) return;
    const mime = (p.mimeType || "").toLowerCase();
    const data = p.body?.data ? Buffer.from(p.body.data, "base64url").toString("utf8") : "";
    if (data && mime === "text/plain" && !p.filename) text += (text ? "\n" : "") + data;
    if (data && mime === "text/html" && !p.filename) html += (html ? "\n" : "") + data;
    for (const c of p.parts || []) walk(c);
  };
  walk(payload);
  return (text.trim() || stripHtml(html)).slice(0, MAX_BODY);
}

const readEnv = (p) => { const o = {}; if (!existsSync(p)) return o; for (const l of readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return o; };
const env = readEnv(join(homedir(), "_secrets_local_only", "family-dashboard.env"));
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY missing"); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
// A dropped connection ("fetch failed") is retried quietly. If the first try actually reached the server, the retry meets a
// duplicate (409 / "already exists"), which counts as done: every write here is keyed so it can only exist once.
async function netFetch(url, init) {
  for (let i = 1; ; i++) {
    try { const r = await fetch(url, init); return { r, retried: i > 1 }; }
    catch (e) { if (i >= 5) throw e; await new Promise((ok) => setTimeout(ok, 1500 * i)); }
  }
}
async function rest(method, path, body, extra = {}) {
  const { r, retried } = await netFetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) { if (retried && r.status === 409) return null; throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 300)}`); }
  return t ? JSON.parse(t) : null;
}
async function upload(key, mime, buf) {
  const { r, retried } = await netFetch(`${URL_}/storage/v1/object/captures/${key.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": mime, "x-upsert": "false" }, body: buf });
  if (!r.ok) { const t = (await r.text()).slice(0, 200); if (retried && /duplicate|exists|409/i.test(`${r.status} ${t}`)) return; throw new Error(`upload ${key} → ${r.status} ${t}`); }
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
const isIcloud = /@(icloud|me|mac)\.com$/i.test(account);

// ---- read the money mail from either mailbox: yields { ref, link, date, subject, snippet, name, address, domain, files: [{name, mime, size, get}] }
async function* moneyMail() {
  if (!isIcloud) {
    const { api } = openGmail(["--account", account], { allowWrite: false });
    const q = `-in:spam -in:trash -in:sent -in:drafts after:${since.toISOString().slice(0, 10).replace(/-/g, "/")}${before ? ` before:${before.toISOString().slice(0, 10).replace(/-/g, "/")}` : ""}`;
    const ids = []; let page = "";
    do { const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=500${page ? `&pageToken=${page}` : ""}`); for (const m of r.messages || []) ids.push(m.id); page = r.nextPageToken || ""; } while (page);
    console.log(`${ids.length} messages (everything but spam, trash, sent and drafts), ${WIN_TXT}`);
    // Several messages in flight at once (Ryan, 2026-10-29: one at a time was ~115 a minute, three and a half hours for
    // Melissa's mailbox, and the apply run would have cost the same again). Gmail allows far more than this; the helper
    // already backs off on 429. Order is kept, so the output reads the same as before.
    const WORKERS = 6;
    let n = 0;
    for (let i = 0; i < ids.length; i += WORKERS) {
      const batch = await Promise.all(ids.slice(i, i + WORKERS).map((id) => api(`/gmail/v1/users/me/messages/${id}?format=full`).then((full) => ({ id, full }))));
      for (const { id, full } of batch) {
      if (++n % 200 === 0) process.stdout.write(`\r  checked ${n}/${ids.length}`);
      const e = parse(full); const d = decide(e); if (d.action !== "money") continue;
      const files = [];
      const walk = (p) => { if (!p) return; if (p.filename && p.body?.attachmentId && READABLE[(p.mimeType || "").toLowerCase()]) files.push({ name: p.filename, mime: p.mimeType.toLowerCase(), size: p.body.size || 0, get: async () => Buffer.from((await api(`/gmail/v1/users/me/messages/${id}/attachments/${p.body.attachmentId}`)).data, "base64url") }); for (const c of p.parts || []) walk(c); };
      walk(full.payload);
      const body = gmailBody(full.payload);
      yield { body, ref: `gmail:${account}:${id}`, link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${id}`, date: e.date, subject: e.subject, snippet: e.snippet, name: e.name, address: e.address, domain: e.domain, files };
      }
    }
    process.stdout.write("\n");
  } else {
    const { ImapFlow } = await import("imapflow"); const { simpleParser } = await import("mailparser");
    const me = readEnv(join(dir, "icloud-ryan.env"));
    if (!me.ICLOUD_MAIL_USER || !me.ICLOUD_MAIL_APP_PASSWORD) { console.error("STOP: icloud-ryan.env missing"); process.exit(2); }
    const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: me.ICLOUD_MAIL_USER, pass: me.ICLOUD_MAIL_APP_PASSWORD }, logger: false });
    await c.connect();
    // The triage moves receipts and confirmations out of the inbox, so look there too: Dashboard/Money (the triage already called these money)
    // and Dashboard/Records and Dashboard/Handled (only what the receipt rules call money; Handled held receipts that carried an unsubscribe link). Sightings are recorded for the inbox only; moved mail adds documents.
    for (const FOLDER of ["INBOX", "Dashboard/Money", "Dashboard/Records", "Dashboard/Handled"]) {
    let lock; try { lock = await c.getMailboxLock(FOLDER, { readOnly: true }); } catch { console.log(`  (folder ${FOLDER} not found, skipped)`); continue; }
    try {
      const uidv = String(c.mailbox.uidValidity);
      const uids = await c.search(before ? { since, before } : { since }, { uid: true });
      console.log(`${uids.length} messages in ${FOLDER}, ${WIN_TXT}`);
      const money = [];
      for (let i = 0; i < uids.length; i += 500) {
        for await (const m of c.fetch(uids.slice(i, i + 500).join(","), { uid: true, envelope: true, internalDate: true, headers: ["list-unsubscribe", "precedence", "auto-submitted", "authentication-results", "reply-to"] }, { uid: true })) {
          const hv = String(m.headers || ""); const h = (n) => (hv.match(new RegExp(`^${n}:[ \\t]*(.*)`, "im")) || [])[1] || "";
          const ev = m.envelope || {}; const f = ev.from?.[0] || {}; const address = (f.address || "").toLowerCase();
          const e = { subject: ev.subject || "", snippet: "", folder: "inbox", address, name: f.name || "", domain: address.split("@")[1] || "", listUnsubscribe: !!h("list-unsubscribe"), precedenceBulk: /bulk|list|junk/i.test(h("precedence")), autoSubmitted: !!h("auto-submitted") && !/^no$/i.test(h("auto-submitted")), date: new Date(ev.date || m.internalDate).toISOString().slice(0, 10) };
          if (FOLDER === "Dashboard/Money" || decide(e).action === "money") { if (suspicion({ ...e, authFail: authFailed(hv), replyDomain: replyDomainOf(hv) }).length) { skippedSus++; continue; } money.push({ uid: m.uid, e }); }
        }
        process.stdout.write(`\r  checked ${Math.min(i + 500, uids.length)}/${uids.length}`);
      }
      process.stdout.write("\n");
      for (const { uid, e } of money) {
        let files = [], snippet = "", body = "";
        const dl = await c.download(uid.toString(), undefined, { uid: true }).catch(() => null);
        if (dl) { const chunks = []; for await (const ch of dl.content) chunks.push(ch); const src = Buffer.concat(chunks);
          if (src.length <= MAX_BYTES) { const p = await simpleParser(src); snippet = (p.text || "").replace(/\s+/g, " ").slice(0, 300); body = ((p.text || "").trim() || stripHtml(p.html)).slice(0, MAX_BODY); files = (p.attachments || []).filter((a) => READABLE[(a.contentType || "").toLowerCase()]).map((a) => ({ name: a.filename || "attachment", mime: a.contentType.toLowerCase(), size: a.size || a.content.length, get: async () => a.content })); } }
        yield { body, ref: FOLDER === "INBOX" ? `icloud:${account}:${uidv}-${uid}` : `icloud:${account}:${FOLDER}:${uidv}-${uid}`, sighting: FOLDER === "INBOX", link: null, date: e.date, subject: e.subject, snippet, name: e.name, address: e.address, domain: e.domain, files };
      }
    } finally { lock.release(); }
    }
    try { await c.logout(); } catch { /* closed */ }
  }
}

async function main() {
  const person = (await rest("GET", "profiles?display_name=eq.Ryan&select=id"))[0]?.id;
  if (!person) throw new Error("no profile named Ryan");
  const stats = { money: 0, sightings: 0, seen: 0, docs: 0, dupes: 0, skipped: 0, bodyOnly: 0, rendered: 0, bodyThin: 0 };
  const examples = [];
  for await (const m of moneyMail()) {
    stats.money++;
    // 1. sighting
    const have = m.sighting === false ? 1 : (await rest("GET", `recurring_observations?source=eq.receipt&ref=eq.${encodeURIComponent(m.ref)}&select=id`)).length;
    if (have) { if (m.sighting !== false) stats.seen++; } else { stats.sightings++; if (APPLY) await rest("POST", "recurring_observations", [{ recurring_id: null, merchant_key: merchantKey(m.name, m.domain), source: "receipt", signal: "charge", observed_on: m.date, amount: amountOf(m), ref: m.ref, mailbox: account }], { Prefer: "return=minimal" }); }
    // 2. documents
    const usable = m.files.filter((f) => f.size <= MAX_BYTES && (f.mime === "application/pdf" || f.size >= MIN_KB * 1024));
    stats.skipped += m.files.length - usable.length;
    // 2b. No attachment: the email itself is the receipt, so render it. Same Inbox path, same hash dedupe, same
    //     "what is this?" question -- the only difference is that the document says where it came from.
    if (!usable.length) {
      stats.bodyOnly++;
      if (!m.body || m.body.trim().length < MIN_BODY) { stats.bodyThin++; if (examples.length < 12) examples.push(`${m.domain.padEnd(26)} ${m.subject.slice(0, 50).padEnd(50)} (no attachment, nothing to render)`); continue; }
      const buf = emailPdf({ from: m.name, address: m.address, date: m.date, subject: m.subject, account, body: m.body });
      const hash = sha(buf);
      if ((await rest("GET", `inbox_items?sha256=eq.${hash}&select=id`)).length) { stats.dupes++; continue; }
      stats.rendered++; if (examples.length < 12) examples.push(`${m.domain.padEnd(26)} ${m.subject.slice(0, 50).padEnd(50)} → rendered from the email body`);
      if (!APPLY) continue;
      const title = `${m.date} ${(m.name || m.domain || "email").slice(0, 40)} ${m.subject}`.replace(/[^\w.\- @]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110) + ".pdf";
      const key = `${person}/${new Date().toISOString().slice(0, 10)}/${randomUUID().slice(0, 8)}-${title.replace(/[^\w.\- ]+/g, "_")}`;
      await upload(key, "application/pdf", buf);
      await rest("POST", "inbox_items", [{ kind: "identify", requested_by: "email", title, origin: "Email body", origin_href: m.link || "#", origin_label: account,
        missing: `From ${m.name || m.address}: "${m.subject.slice(0, 80)}". The sender attached nothing, so this is the email itself. What is it? A receipt, a bill, a statement, a form, or something else?`,
        options: ["Receipt", "Bill", "Statement", "Form", "Something else"], file_path: key, mime: "application/pdf", size_bytes: buf.length, sha256: hash, created_by: person, for_person: "Ryan" }], { Prefer: "return=minimal" });
      continue;
    }
    for (const f of usable) {
      const buf = await f.get(); const hash = sha(buf);
      const dup = (await rest("GET", `inbox_items?sha256=eq.${hash}&select=id`)).length;
      if (dup) { stats.dupes++; continue; }
      stats.docs++; if (examples.length < 12) examples.push(`${m.domain.padEnd(26)} ${m.subject.slice(0, 50).padEnd(50)} → ${f.name}`);
      if (!APPLY) continue;
      const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
      const key = `${person}/${new Date().toISOString().slice(0, 10)}/${randomUUID().slice(0, 8)}-${safe}`;
      await upload(key, f.mime, buf);
      await rest("POST", "inbox_items", [{ kind: "identify", requested_by: "email", title: f.name, origin: "Email", origin_href: m.link || "#", origin_label: account,
        missing: `From ${m.name || m.address}: "${m.subject.slice(0, 80)}". What is this? A receipt, a bill, a statement, a form, or something else?`,
        options: ["Receipt", "Bill", "Statement", "Form", "Something else"], file_path: key, mime: f.mime, size_bytes: buf.length, sha256: hash, created_by: person, for_person: "Ryan" }], { Prefer: "return=minimal" });
    }
  }
  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} ${account}: ${stats.money} receipt/statement emails, ${WIN_TXT}`);
  console.log(`  sightings: ${stats.sightings} new${stats.seen ? `, ${stats.seen} already recorded` : ""}`);
  console.log(`  documents to the Inbox: ${stats.docs} attached${stats.dupes ? `, ${stats.dupes} already there` : ""}; ${stats.skipped} tiny images/logos skipped`);
  console.log(`  body-only receipts: ${stats.bodyOnly}, of which ${stats.rendered} rendered to PDF${stats.bodyThin ? ` and ${stats.bodyThin} had nothing to render` : ""}`);
  if (examples.length) { console.log("  examples:"); for (const x of examples) console.log(`    ${x}`); }
  if (APPLY) {
    const rows = (await rest("GET", `inbox_items?origin=in.(Email,"Email body")&origin_label=eq.${encodeURIComponent(account)}&select=id`)).length;
    const obs = (await rest("GET", `recurring_observations?mailbox=eq.${encodeURIComponent(account)}&source=eq.receipt&select=id`)).length;
    console.log(`  verified in the database: ${rows} Email documents in the Inbox for this account, ${obs} receipt sightings. Mailbox unchanged.`);
    if (skippedSus) console.log(`  skipped as suspicious (not recorded, attachments not copied): ${skippedSus}.`);
    await rest("POST", "activity_log", { actor: "email-agent", action: "email_receipts", subject: `${account}: ${stats.docs} receipt documents added to the Inbox, ${stats.sightings} sightings recorded`, ref: account, undoable: false }).catch(() => {});
  } else console.log("  Nothing was changed. Run again with --apply to do it.");
}
main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
