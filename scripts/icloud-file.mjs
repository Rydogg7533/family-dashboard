#!/usr/bin/env node
// iCloud inbox → folders. Run by hand on the Mac mini. Node 20+ (imapflow is already a dependency).
//
//   node scripts/icloud-file.mjs                          # DRY RUN (default): sorts the inbox in memory, prints counts and examples, changes nothing
//   node scripts/icloud-file.mjs --apply --limit 200      # moves the NEWEST 200 that would move (review the dry run first)
//   node scripts/icloud-file.mjs --apply                  # moves everything the dry run showed
//   node scripts/icloud-file.mjs --undo <file printed by the run>   # puts those messages back in the inbox
//   options: --keep tiller.com,kalshi.com (senders to leave alone)  --months 12  --window 0-12 (only mail this many months ago; then 12-24, 24-36 ...)  --env <icloud env file>
//
// What it does, and only this: MOVES mail out of INBOX into folders it creates under "Dashboard":
//   Handled   marketing, one-time codes, automated no-reply, shipping updates          (within the last 12 months)
//   Money     receipts, orders, invoices, statements                                    (any age)
//   Records   confirmations, bookings, warranties                                       (any age)
//   Archive older than 12 months   everything else that is older than 12 months
// Left in the inbox on purpose: starred mail, calendar invites, and anything newer than 12 months the free rules cannot place
// (a person or a new company: the triage step turns those into tasks and moves them to Dashboard/Waiting).
// Safety: never deletes, never marks read or unread, never flags, never sends. Moves keep every flag. Headers are read with BODY.PEEK.
// Every move is written to an undo list (~/_secrets_local_only/email-agent/undo/icloud-*.json) BEFORE the next batch; --undo reverses it.
// No model, nothing leaves this Mac. The app-specific password is read from ~/_secrets_local_only/email-agent/icloud-ryan.env, never printed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ImapFlow } from "imapflow";
import { decide } from "./email-lib.mjs";
import { suspicion, authFailed, replyDomainOf } from "./phish-lib.mjs";

export const FOLDERS = { handled: "Dashboard/Handled", money: "Dashboard/Money", records: "Dashboard/Records", archive: "Dashboard/Archive older than 12 months", suspicious: "Dashboard/Suspicious" };

// Pure: where one message should go, or null to leave it in the inbox. m = { flagged, date (ms), subject, address, domain, listUnsubscribe, precedenceBulk, autoSubmitted }
export function classify(m, { now = Date.now(), months = 12, keep = [] } = {}) {
  if (m.flagged) return { to: null, why: "starred" };
  const sus = suspicion(m); if (sus.length) return { to: "suspicious", why: sus[0] };
  if (keep.some((k) => m.address === k || m.domain === k || m.domain.endsWith("." + k))) return { to: null, why: "sender you keep" };
  const old = m.date && m.date < now - months * 30.44 * 86400_000;
  const d = decide({ folder: "inbox", subject: m.subject || "", snippet: "", address: m.address || "", listUnsubscribe: !!m.listUnsubscribe, precedenceBulk: !!m.precedenceBulk, autoSubmitted: !!m.autoSubmitted });
  if (d.action === "money") return { to: "money", why: d.reason };
  if (d.action === "record") return { to: "records", why: d.reason };
  if (d.action === "calendar") return { to: null, why: "calendar invite" };
  if (old) return { to: "archive", why: `older than ${months} months (${d.reason})` };
  if (d.action === "archive" || d.action === "fyi") return { to: "handled", why: d.reason };
  return { to: null, why: "needs a person (triage step)" };
}

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const UNDO = opt("--undo");
const LIMIT = opt("--limit") ? parseInt(opt("--limit"), 10) : Infinity;
const MONTHS = parseInt(opt("--months") || "12", 10); // how old counts as "old" (the Archive rule)
const WIN = (opt("--window") || "0-9999").split("-").map((x) => parseInt(x, 10)); // only touch mail in this slice, in months ago: 0-12, then 12-24, ...
const WIN_NEW_MS = Date.now() - (WIN[0] || 0) * 30.44 * 86400_000, WIN_OLD_MS = Date.now() - (WIN[1] || 9999) * 30.44 * 86400_000;
const keep = (opt("--keep") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
export const readEnv = (p) => { const o = {}; if (!existsSync(p)) return o; for (const l of readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return o; };
export const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const hdr = (buf, name) => { const m = String(buf || "").match(new RegExp(`^${name}:\\s*(.*)$`, "im")); return m ? m[1].trim() : ""; };

export async function connect() {
  const envPath = (opt("--env") || join(homedir(), "_secrets_local_only", "email-agent", "icloud-ryan.env")).replace(/^~/, homedir());
  const e = readEnv(envPath);
  if (!e.ICLOUD_MAIL_USER || !e.ICLOUD_MAIL_APP_PASSWORD) { console.error(`STOP: ICLOUD_MAIL_USER / ICLOUD_MAIL_APP_PASSWORD not found in ${envPath}`); process.exit(1); }
  const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: e.ICLOUD_MAIL_USER, pass: e.ICLOUD_MAIL_APP_PASSWORD }, logger: false });
  await c.connect();
  return { c, user: e.ICLOUD_MAIL_USER };
}
export async function ensureFolder(c, path) { try { await c.mailboxCreate(path); } catch (e) { if (!/exist/i.test(String(e.responseText || e.message || e))) { /* some servers say ALREADYEXISTS differently; the move will fail loudly if it is really missing */ } } }

// Reads headers of every INBOX message (BODY.PEEK, nothing is marked read). The caller must hold the INBOX lock. Newest first.
export async function scanInbox(c) {
  const uids = c.mailbox.exists ? await c.search({ all: true }, { uid: true }) : [];
  const rows = [];
  for (const g of chunks(uids, 400)) for await (const m of c.fetch(g.join(","), { uid: true, flags: true, envelope: true, internalDate: true, headers: ["list-unsubscribe", "precedence", "auto-submitted", "authentication-results", "reply-to"] }, { uid: true })) {
    const a = (m.envelope?.from?.[0]?.address || "").toLowerCase();
    rows.push({ uid: m.uid, flagged: m.flags?.has("\\Flagged"), date: new Date(m.envelope?.date || m.internalDate).getTime(), subject: m.envelope?.subject || "", address: a, name: m.envelope?.from?.[0]?.name || "", domain: a.split("@")[1] || "", authFail: authFailed(m.headers), replyDomain: replyDomainOf(m.headers),
      messageId: (m.envelope?.messageId || "").replace(/^<|>$/g, ""), listUnsubscribe: !!hdr(m.headers, "list-unsubscribe"), precedenceBulk: /bulk|list|junk/i.test(hdr(m.headers, "precedence")), autoSubmitted: !!hdr(m.headers, "auto-submitted") && !/^no$/i.test(hdr(m.headers, "auto-submitted")) });
  }
  rows.sort((x, y) => y.date - x.date);
  return rows;
}

async function main() {
  const undoDir = join(homedir(), "_secrets_local_only", "email-agent", "undo"); mkdirSync(undoDir, { recursive: true });
  const { c, user } = await connect();
  try {
    if (UNDO) return await undo(c, UNDO);
    const lock = await c.getMailboxLock("INBOX");
    try {
      const rows = await scanInbox(c);
      const plan = rows.filter((r) => r.date <= WIN_NEW_MS && r.date >= WIN_OLD_MS).map((r) => ({ ...r, ...classify(r, { months: MONTHS, keep }) }));
      const by = (k) => plan.filter((p) => p.to === k);
      console.log(`${user}: ${rows.length} messages in the inbox; ${plan.length} in this window (${WIN[0] || 0}-${WIN[1] || "all"} months ago).`);
      for (const k of ["handled", "money", "records", "archive", "suspicious"]) { const l = by(k); console.log(`  → ${FOLDERS[k].padEnd(40)} ${String(l.length).padStart(5)}${l.length ? `   e.g. ${l.slice(0, 3).map((p) => `${p.address} "${p.subject.slice(0, 40)}"`).join(" | ")}` : ""}`); }
      const stay = plan.filter((p) => !p.to);
      const stays = {}; for (const p of stay) stays[p.why] = (stays[p.why] || 0) + 1;
      console.log(`  stays in the inbox ${String(stay.length).padStart(5)}   (${Object.entries(stays).map(([k, v]) => `${v} ${k}`).join(", ")})`);
      if (!APPLY) { console.log("\nDRY RUN: nothing changed. Add --apply --limit 200 to move the newest 200 of these."); return; }

      const todo = plan.filter((p) => p.to).slice(0, LIMIT);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const undoFile = join(undoDir, `icloud-${stamp}.json`);
      const log = { account: user, at: new Date().toISOString(), moves: [] };
      writeFileSync(undoFile, JSON.stringify(log));
      for (const k of ["handled", "money", "records", "archive", "suspicious"]) if (todo.some((p) => p.to === k)) await ensureFolder(c, FOLDERS[k]);
      let moved = 0;
      for (const k of ["handled", "money", "records", "archive", "suspicious"]) {
        const group = todo.filter((p) => p.to === k);
        for (const g of chunks(group, 100)) {
          const res = await c.messageMove(g.map((p) => p.uid).join(","), FOLDERS[k], { uid: true });
          for (const p of g) log.moves.push({ to: FOLDERS[k], messageId: p.messageId, srcUid: p.uid, destUid: res?.uidMap?.get(p.uid) ?? null });
          writeFileSync(undoFile, JSON.stringify(log)); // recorded before the next batch
          moved += g.length; console.log(`  moved ${moved}/${todo.length}`);
        }
      }
      console.log(`\nDone: ${moved} moved. Undo with:\n  node scripts/icloud-file.mjs --undo ${undoFile}`);
    } finally { lock.release(); }
  } finally { try { await c.logout(); } catch { /* closed */ } }
}

// Put every moved message back in the inbox, found by its destination UID or, failing that, its Message-ID.
async function undo(c, file) {
  const log = JSON.parse(readFileSync(file, "utf8"));
  let back = 0, missing = 0;
  for (const dest of [...new Set(log.moves.map((m) => m.to))]) {
    const lock = await c.getMailboxLock(dest);
    try {
      const uids = [];
      for (const m of log.moves.filter((x) => x.to === dest)) {
        let uid = m.destUid;
        if (!uid && m.messageId) uid = (await c.search({ header: { "message-id": m.messageId } }, { uid: true }))[0];
        if (uid) uids.push(uid); else missing++;
      }
      for (const g of chunks(uids, 100)) { await c.messageMove(g.join(","), "INBOX", { uid: true }); back += g.length; }
    } finally { lock.release(); }
  }
  console.log(`Put back ${back} messages in the inbox${missing ? `; ${missing} could not be found (moved or removed by hand since)` : ""}.`);
}

if (process.argv[1] && process.argv[1].endsWith("icloud-file.mjs")) main().catch((e) => { console.error(e.message || e); process.exit(1); });
