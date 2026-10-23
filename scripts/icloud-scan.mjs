#!/usr/bin/env node
// iCloud mail READ-ONLY scan (step 1 of the iCloud plan, D6). Run by hand on the Mac mini. Changes NOTHING.
//   node scripts/icloud-scan.mjs                    # folders + the whole INBOX
//   node scripts/icloud-scan.mjs --max 20000        # stop after this many inbox messages (newest first)
// Opens every folder read-only (EXAMINE) and reads only headers (From, Subject, Date, List-Unsubscribe, Precedence, Auto-Submitted)
// and flags. No bodies, no attachments, no model: nothing leaves this machine. Applies the same free rules as email-scan.mjs
// (scripts/email-lib.mjs decide) so the numbers are comparable with the Gmail scans.
// Terminal: counts and top sender DOMAINS only (no subjects). Full report (with example subjects): ~/_secrets_local_only/email-agent/reports/
// (mode 600, never overwritten, never cloud-synced). Credentials: ICLOUD_MAIL_USER / ICLOUD_MAIL_APP_PASSWORD in
// ~/_secrets_local_only/email-agent/icloud-ryan.env (never printed).
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ImapFlow } from "imapflow";
import { decide, dir } from "./email-lib.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const MAX = parseInt(opt("--max") || "100000", 10);
const envPath = join(dir, "icloud-ryan.env");
const env = {}; if (existsSync(envPath)) for (const l of readFileSync(envPath, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
if (!env.ICLOUD_MAIL_USER || !env.ICLOUD_MAIL_APP_PASSWORD) { console.error(`STOP: ICLOUD_MAIL_USER / ICLOUD_MAIL_APP_PASSWORD not found in ${envPath}`); process.exit(2); }

const dec = (s) => { try { return new TextDecoder().decode(Buffer.from(s)); } catch { return String(s); } };
const hdr = (buf, name) => { const m = dec(buf || "").match(new RegExp(`^${name}:[ \\t]*(.*(?:\\r?\\n[ \\t].*)*)`, "im")); return m ? m[1].replace(/\r?\n[ \t]+/g, " ").trim() : ""; };
const pct = (n, t) => (t ? `${Math.round((100 * n) / t)}%` : "0%");
const ageBucket = (ts) => { const d = (Date.now() - ts) / 86400000; return d <= 30 ? "0-30 days" : d <= 90 ? "31-90 days" : d <= 365 ? "3-12 months" : d <= 1095 ? "1-3 years" : "over 3 years"; };

const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: env.ICLOUD_MAIL_USER, pass: env.ICLOUD_MAIL_APP_PASSWORD }, logger: false });
const t0 = Date.now();
await c.connect();
try {
  // folders
  const boxes = await c.list();
  const folders = [];
  for (const b of boxes) { if (b.flags?.has("\\Noselect")) continue; try { const s = await c.status(b.path, { messages: true, unseen: true }); folders.push({ path: b.path, use: b.specialUse || "", n: s.messages, unseen: s.unseen }); } catch { /* unselectable */ } }
  folders.sort((a, b) => b.n - a.n);

  // inbox
  const lock = await c.getMailboxLock("INBOX", { readOnly: true });
  const rows = [];
  try {
    const uids = (c.mailbox.exists ? await c.search({ all: true }, { uid: true }) : []).slice(-MAX);
    for (let i = 0; i < uids.length; i += 500) {
      const part = uids.slice(i, i + 500).join(",");
      for await (const m of c.fetch(part, { uid: true, flags: true, envelope: true, internalDate: true, headers: ["list-unsubscribe", "precedence", "auto-submitted"] }, { uid: true })) {
        const e = m.envelope || {}; const f = e.from?.[0] || {}; const address = (f.address || "").toLowerCase();
        const prec = hdr(m.headers, "precedence"), auto = hdr(m.headers, "auto-submitted");
        const ts = new Date(e.date || m.internalDate).getTime() || 0;
        const r = { uid: m.uid, name: f.name || "", address, domain: address.split("@")[1] || "", subject: e.subject || "", snippet: "", folder: "inbox",
          listUnsubscribe: !!hdr(m.headers, "list-unsubscribe"), precedenceBulk: /bulk|list|junk/i.test(prec), autoSubmitted: !!auto && !/^no$/i.test(auto), ts, unread: !m.flags.has("\\Seen"), starred: m.flags.has("\\Flagged") };
        r.d = decide(r); rows.push(r);
      }
      process.stdout.write(`\r  read ${Math.min(i + 500, uids.length)} of ${uids.length} inbox headers…`);
    }
  } finally { lock.release(); }
  process.stdout.write("\n");

  // summaries
  const by = (fn) => { const m = new Map(); for (const r of rows) { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  const actions = by((r) => r.d.action), ages = by((r) => ageBucket(r.ts)), domains = by((r) => r.domain || "(none)").slice(0, 25);
  const unread = rows.filter((r) => r.unread).length, starred = rows.filter((r) => r.starred).length;
  const total = rows.length;

  // private report
  const md = [`# iCloud scan ${new Date().toISOString()}`, `Inbox messages read: ${total} (unread ${unread}, starred ${starred})`, "", "## Folders (existing structure)", ...folders.map((f) => `- ${f.path}${f.use ? ` [${f.use}]` : ""}: ${f.n} (${f.unseen} unseen)`), "", "## Inbox by free rule", ...actions.map(([a, n]) => `- ${a}: ${n}`), "", "## Inbox by age", ...ages.map(([a, n]) => `- ${a}: ${n}`), "", "## Top 100 sender domains (with an example subject)"];
  for (const [d, n] of by((r) => r.domain || "(none)").slice(0, 100)) { const ex = rows.find((r) => (r.domain || "(none)") === d); md.push(`- ${d}: ${n} — ${ex.d.action} — e.g. "${ex.subject.slice(0, 80)}"`); }
  const out = join(dir, "reports"); mkdirSync(out, { recursive: true, mode: 0o700 });
  let file = join(out, `icloud-scan-${new Date().toISOString().slice(0, 10)}.md`);
  for (let n = 2; existsSync(file); n++) file = file.replace(/(-\d+)?\.md$/, `-${n}.md`);
  writeFileSync(file, md.join("\n") + "\n", { flag: "wx", mode: 0o600 });

  console.log(`\nPASS — ${folders.length} folders, ${total} inbox messages read in ${Math.round((Date.now() - t0) / 1000)}s. Nothing was changed.\n`);
  console.log(`Inbox: ${total} messages, ${unread} unread, ${starred} starred (starred is never moved)\n`);
  console.log("What the free rules would do with the inbox:"); for (const [a, n] of actions) console.log(`  ${String(n).padStart(6)}  ${pct(n, total).padStart(4)}  ${a}`);
  console.log("\nInbox by age:"); for (const [a, n] of ages) console.log(`  ${String(n).padStart(6)}  ${a}`);
  console.log("\nBusiest sender domains:"); for (const [d, n] of domains.slice(0, 15)) console.log(`  ${String(n).padStart(6)}  ${d}`);
  console.log("\nLargest existing folders:"); for (const f of folders.slice(0, 12)) console.log(`  ${String(f.n).padStart(6)}  ${f.path}${f.use ? `  [${f.use}]` : ""}`);
  console.log(`\nFull report (private, local only): ${file}`);
} finally { try { await c.logout(); } catch { /* closed */ } }
