#!/usr/bin/env node
// Connect a mailbox over IMAP with an app password (D75): the no-Google-Cloud-project way. Run by hand on the Mac mini. Node 20+.
//
//   node scripts/mail-connect.mjs --provider gmail --account melissa@gmail.com --person Melissa
//   node scripts/mail-connect.mjs --provider icloud --account me@icloud.com --person Ryan
//   node scripts/mail-connect.mjs --provider other --host imap.example.com --account me@example.com --person Ryan
//
// What it does: asks for the app password (typed blind, never echoed, never printed, never logged), signs in read-only and lists the
// folders to prove it works, then writes ~/_secrets_local_only/email-agent/imap-<address>.env (mode 600). It refuses to overwrite an existing
// file and refuses an address that is already signed in through the Gmail API (one mailbox, one sync). Then it runs one dry sync.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { EMAIL_DIR, PROVIDERS, apiTokenExists, probe } from "./imap-mail-sync.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };

const provider = (opt("--provider") || "").toLowerCase();
const account = (opt("--account") || "").trim().toLowerCase();
const person = (opt("--person") || "").trim();
const host = opt("--host") || PROVIDERS[provider]?.host;
const port = parseInt(opt("--port") || String(PROVIDERS[provider]?.port || 993), 10);
if (!PROVIDERS[provider]) die(`pass --provider ${Object.keys(PROVIDERS).join("|")}`);
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) die("pass --account <the mailbox address>");
if (!person) die("pass --person <whose mailbox this is, as their name in the app>");
if (!host) die("pass --host <imap server> for --provider other");
const file = join(EMAIL_DIR, `imap-${account}.env`);
if (existsSync(file)) die(`${file} already exists. Not overwriting. Move it away first if you mean to redo this sign-in.`);
if (apiTokenExists(account)) die(`${account} is already signed in through the Gmail API (google-${account}.json). One mailbox, one sync: move that file away first if you want IMAP instead.`);

console.log(`Connecting ${PROVIDERS[provider].label}: ${account} for ${person} (${host}:${port}, read-only).`);
console.log(`  ${PROVIDERS[provider].note}`);
const pass = await askHidden("App password (typing is hidden): ");
if (!pass) die("no password typed. Nothing saved.");

let info;
try { info = await probe({ host, port, user: account, pass }); }
catch (e) { die(`sign-in failed: ${String(e.responseText || e.message || e).slice(0, 200)}. Nothing saved. Check the address, that IMAP is on, and that this is an APP password, not the account password.`); }
console.log(`  signed in: ${info.folders.length} folders, inbox has ${info.inbox} messages, drafts folder ${info.drafts ? `"${info.drafts}"` : "not found (drafts will be skipped)"}`);

mkdirSync(EMAIL_DIR, { recursive: true, mode: 0o700 });
writeFileSync(file, `MAIL_PROVIDER=${provider}\nMAIL_HOST=${host}\nMAIL_PORT=${port}\nMAIL_USER=${account}\nMAIL_APP_PASSWORD=${pass}\nMAIL_PERSON=${person}\n`, { flag: "wx", mode: 0o600 });
console.log(`  saved: ${file} (mode 600)\n\nPASS. Dry sync (reads only):`);
const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(here, "imap-mail-sync.mjs"), "--dry", "--account", account], { stdio: "inherit" });
if (r.status !== 0) console.error("The dry sync did not finish cleanly; the sign-in file is saved, so fix the cause and run: node scripts/imap-mail-sync.mjs --dry --account " + account);
else console.log(`\nDone. The Mac mini's imap-mail-sync job picks this mailbox up within 5 minutes (install it with: node scripts/hub.mjs --apply).`);

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = process.stdout; let muted = false;
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (!muted) write.call(rl, s); };
    rl.question(q, (a) => { muted = false; out.write("\n"); rl.close(); resolve(a.trim()); });
    muted = true;
  });
}
