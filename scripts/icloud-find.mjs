#!/usr/bin/env node
// iCloud mail FIND (read-only). Run by hand on the Mac mini. Changes NOTHING: folders are opened read-only, only headers are fetched.
//   node scripts/icloud-find.mjs --from amazon.com --since 2026-10-01
//   node scripts/icloud-find.mjs --text 113-6359920-1869836
//   node scripts/icloud-find.mjs --from amazon.com --text "Door Pillar" --since 2026-09-01
//   node scripts/icloud-find.mjs --from auto-confirm@amazon.com --since 2026-10-11 --before 2026-10-12 --show   # also print the message text (first 2500 chars, peek only: nothing is marked read)
// Searches EVERY folder (the app's sync sees only the inbox, and mail that left it is gone from view). Prints folder, date, sender, subject.
// Nothing is copied, filed or sent. Credentials: ~/_secrets_local_only/email-agent/icloud-ryan.env (never printed).
import { readFileSync, existsSync } from "node:fs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { dir } from "./email-lib.mjs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const FROM = opt("--from"), TEXT = opt("--text"), SINCE = opt("--since"), BEFORE = opt("--before"), SHOW = args.includes("--show");
if (!FROM && !TEXT) { console.error("STOP: pass --from and/or --text"); process.exit(2); }
const envPath = join(dir, "icloud-ryan.env");
const env = {}; if (existsSync(envPath)) for (const l of readFileSync(envPath, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
if (!env.ICLOUD_MAIL_USER || !env.ICLOUD_MAIL_APP_PASSWORD) { console.error(`STOP: credentials not found in ${envPath}`); process.exit(2); }

const query = {};
if (FROM) query.from = FROM;
if (TEXT) query.text = TEXT;
if (SINCE) query.since = new Date(SINCE);
if (BEFORE) query.before = new Date(BEFORE);

const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: env.ICLOUD_MAIL_USER, pass: env.ICLOUD_MAIL_APP_PASSWORD }, logger: false });
await c.connect();
let found = 0;
try {
  for (const b of await c.list()) {
    if (b.flags?.has("\\Noselect")) continue;
    const lock = await c.getMailboxLock(b.path, { readOnly: true });
    try {
      const uids = c.mailbox.exists ? await c.search(query, { uid: true }) : [];
      if (!uids.length) continue;
      for await (const m of c.fetch(uids.join(","), { uid: true, envelope: true, internalDate: true, ...(SHOW ? { source: true } : {}) }, { uid: true })) {
        const e = m.envelope || {};
        const d = new Date(e.date || m.internalDate).toISOString().slice(0, 16).replace("T", " ");
        console.log(`${b.path.padEnd(18)} ${d}  ${(e.from?.[0]?.address || "").padEnd(34)} ${(e.subject || "").slice(0, 90)}`);
        found++;
        if (SHOW && m.source) {
          const p = await simpleParser(m.source);
          const t = String(p.text || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
          console.log(`  ---\n  ${t.slice(0, 2500)}\n  ---`);
        }
      }
    } finally { lock.release(); }
  }
} finally { await c.logout(); }
console.log(`\n${found} message(s) found across all folders. Nothing was changed.`);
