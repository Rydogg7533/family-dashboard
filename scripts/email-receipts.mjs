#!/usr/bin/env node
// Receipts bridge: receipt and statement mail → the app. Run by hand on the Mac mini. Node 20+.
//   node scripts/email-receipts.mjs --account admin@shvr.co                 # DRY RUN (default): counts only, writes nothing
//   node scripts/email-receipts.mjs --account admin@shvr.co --apply         # records sightings, copies attachments into the app Inbox
//   node scripts/email-receipts.mjs --account ryanrossiter@icloud.com --apply   # iCloud (IMAP) works the same way
//   options: --months 12 (how far back; default 12)   --window 12-24 (a slice, in months ago: here the year before last year)   --min-kb 20 (images smaller than this are logos, skipped)
// For every inbox message the free rules call "money" (receipt, order, invoice, statement) in the window:
//   1. SIGHTING  one recurring_observations row (source 'receipt', merchant key, date, visible amount, ref = message id). Append-only; a
//                re-run adds nothing twice. This is what Subscriptions reads to spot repeat charges.
//   2. DOCUMENT  each attached PDF or image (the kinds the Inbox reader can read, ≤ 20 MB) is copied into the private "captures" bucket
//                and becomes an Inbox item that asks "Yes, file it", exactly like a phone upload. Dedupe by content hash: an attachment
//                already in the Inbox is skipped, so a re-run is safe. Body-only receipts make no document (sighting only).
// The MAILBOX IS NEVER CHANGED: Gmail is opened read-only (any write call throws); iCloud folders are opened EXAMINE with BODY.PEEK.
// Nothing is deleted, nothing is sent, no model is called. Secrets: ~/_secrets_local_only/family-dashboard.env (Supabase) and
// ~/_secrets_local_only/email-agent/ (Gmail tokens, icloud-ryan.env). Never printed.
import { suspicion, authFailed, replyDomainOf } from "./phish-lib.mjs";
import { readFileSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { dir, option, openGmail, parse, decide, merchantKey, amountOf } from "./email-lib.mjs";

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
    const q = `in:inbox after:${since.toISOString().slice(0, 10).replace(/-/g, "/")}${before ? ` before:${before.toISOString().slice(0, 10).replace(/-/g, "/")}` : ""}`;
    const ids = []; let page = "";
    do { const r = await api(`/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=500${page ? `&pageToken=${page}` : ""}`); for (const m of r.messages || []) ids.push(m.id); page = r.nextPageToken || ""; } while (page);
    console.log(`${ids.length} inbox messages, ${WIN_TXT}`);
    let n = 0;
    for (const id of ids) {
      if (++n % 200 === 0) process.stdout.write(`\r  checked ${n}/${ids.length}`);
      const full = await api(`/gmail/v1/users/me/messages/${id}?format=full`);
      const e = parse(full); const d = decide(e); if (d.action !== "money") continue;
      const files = [];
      const walk = (p) => { if (!p) return; if (p.filename && p.body?.attachmentId && READABLE[(p.mimeType || "").toLowerCase()]) files.push({ name: p.filename, mime: p.mimeType.toLowerCase(), size: p.body.size || 0, get: async () => Buffer.from((await api(`/gmail/v1/users/me/messages/${id}/attachments/${p.body.attachmentId}`)).data, "base64url") }); for (const c of p.parts || []) walk(c); };
      walk(full.payload);
      yield { ref: `gmail:${account}:${id}`, link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${id}`, date: e.date, subject: e.subject, snippet: e.snippet, name: e.name, address: e.address, domain: e.domain, files };
    }
    process.stdout.write("\n");
  } else {
    const { ImapFlow } = await import("imapflow"); const { simpleParser } = await import("mailparser");
    const me = readEnv(join(dir, "icloud-ryan.env"));
    if (!me.ICLOUD_MAIL_USER || !me.ICLOUD_MAIL_APP_PASSWORD) { console.error("STOP: icloud-ryan.env missing"); process.exit(2); }
    const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: me.ICLOUD_MAIL_USER, pass: me.ICLOUD_MAIL_APP_PASSWORD }, logger: false });
    await c.connect();
    const lock = await c.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uidv = String(c.mailbox.uidValidity);
      const uids = await c.search(before ? { since, before } : { since }, { uid: true });
      console.log(`${uids.length} inbox messages, ${WIN_TXT}`);
      const money = [];
      for (let i = 0; i < uids.length; i += 500) {
        for await (const m of c.fetch(uids.slice(i, i + 500).join(","), { uid: true, envelope: true, internalDate: true, headers: ["list-unsubscribe", "precedence", "auto-submitted", "authentication-results", "reply-to"] }, { uid: true })) {
          const hv = String(m.headers || ""); const h = (n) => (hv.match(new RegExp(`^${n}:[ \\t]*(.*)`, "im")) || [])[1] || "";
          const ev = m.envelope || {}; const f = ev.from?.[0] || {}; const address = (f.address || "").toLowerCase();
          const e = { subject: ev.subject || "", snippet: "", folder: "inbox", address, name: f.name || "", domain: address.split("@")[1] || "", listUnsubscribe: !!h("list-unsubscribe"), precedenceBulk: /bulk|list|junk/i.test(h("precedence")), autoSubmitted: !!h("auto-submitted") && !/^no$/i.test(h("auto-submitted")), date: new Date(ev.date || m.internalDate).toISOString().slice(0, 10) };
          if (decide(e).action === "money") { if (suspicion({ ...e, authFail: authFailed(hv), replyDomain: replyDomainOf(hv) }).length) { skippedSus++; continue; } money.push({ uid: m.uid, e }); }
        }
        process.stdout.write(`\r  checked ${Math.min(i + 500, uids.length)}/${uids.length}`);
      }
      process.stdout.write("\n");
      for (const { uid, e } of money) {
        let files = [], snippet = "";
        const dl = await c.download(uid.toString(), undefined, { uid: true }).catch(() => null);
        if (dl) { const chunks = []; for await (const ch of dl.content) chunks.push(ch); const src = Buffer.concat(chunks);
          if (src.length <= MAX_BYTES) { const p = await simpleParser(src); snippet = (p.text || "").replace(/\s+/g, " ").slice(0, 300); files = (p.attachments || []).filter((a) => READABLE[(a.contentType || "").toLowerCase()]).map((a) => ({ name: a.filename || "attachment", mime: a.contentType.toLowerCase(), size: a.size || a.content.length, get: async () => a.content })); } }
        yield { ref: `icloud:${account}:${uidv}-${uid}`, link: null, date: e.date, subject: e.subject, snippet, name: e.name, address: e.address, domain: e.domain, files };
      }
    } finally { lock.release(); try { await c.logout(); } catch { /* closed */ } }
  }
}

async function main() {
  const person = (await rest("GET", "profiles?display_name=eq.Ryan&select=id"))[0]?.id;
  if (!person) throw new Error("no profile named Ryan");
  const stats = { money: 0, sightings: 0, seen: 0, docs: 0, dupes: 0, skipped: 0, bodyOnly: 0 };
  const examples = [];
  for await (const m of moneyMail()) {
    stats.money++;
    // 1. sighting
    const have = (await rest("GET", `recurring_observations?source=eq.receipt&ref=eq.${encodeURIComponent(m.ref)}&select=id`)).length;
    if (have) stats.seen++; else { stats.sightings++; if (APPLY) await rest("POST", "recurring_observations", [{ recurring_id: null, merchant_key: merchantKey(m.name, m.domain), source: "receipt", signal: "charge", observed_on: m.date, amount: amountOf(m), ref: m.ref, mailbox: account }], { Prefer: "return=minimal" }); }
    // 2. documents
    const usable = m.files.filter((f) => f.size <= MAX_BYTES && (f.mime === "application/pdf" || f.size >= MIN_KB * 1024));
    stats.skipped += m.files.length - usable.length;
    if (!usable.length) { stats.bodyOnly++; if (examples.length < 12) examples.push(`${m.domain.padEnd(26)} ${m.subject.slice(0, 50).padEnd(50)} (no attachment)`); continue; }
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
  console.log(`  documents to the Inbox: ${stats.docs}${stats.dupes ? `, ${stats.dupes} already there` : ""}; ${stats.bodyOnly} body-only receipts (sighting only); ${stats.skipped} tiny images/logos skipped`);
  if (examples.length) { console.log("  examples:"); for (const x of examples) console.log(`    ${x}`); }
  if (APPLY) {
    const rows = (await rest("GET", `inbox_items?origin=eq.Email&origin_label=eq.${encodeURIComponent(account)}&select=id`)).length;
    const obs = (await rest("GET", `recurring_observations?mailbox=eq.${encodeURIComponent(account)}&source=eq.receipt&select=id`)).length;
    console.log(`  verified in the database: ${rows} Email documents in the Inbox for this account, ${obs} receipt sightings. Mailbox unchanged.`);
    if (skippedSus) console.log(`  skipped as suspicious (not recorded, attachments not copied): ${skippedSus}.`);
    await rest("POST", "activity_log", { actor: "email-agent", action: "email_receipts", subject: `${account}: ${stats.docs} receipt documents added to the Inbox, ${stats.sightings} sightings recorded`, ref: account, undoable: false }).catch(() => {});
  } else console.log("  Nothing was changed. Run again with --apply to do it.");
}
main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
