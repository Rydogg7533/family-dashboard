#!/usr/bin/env node
// One command per Gmail account: backup -> cleanup -> tasks -> filing. Run by hand on the Mac mini. Node 20+, no dependencies.
//
//   node scripts/email-account.mjs --account admin@medrepdesk.io
//   node scripts/email-account.mjs --account admin@medrepdesk.io,rross15253@gmail.com     # one after the other
//   optional: --keep tiller.com,kalshi.com   (senders never archived)   --dest "<folder>"   --no-model
//
// It runs the same steps we ran by hand for admin@shvr.co, in this order, and STOPS if a step fails:
//   1. BACKUP    scripts/gmail-backup.mjs         every message to the 8TB drive. The next steps do not run unless it says PASS.
//   2. CLEANUP   scripts/email-apply.mjs          shows a DRY RUN of the inbox cleanup (promotions, social, marketing, codes),
//                                                 then asks you to type yes before it archives anything. Archive only, undo list kept.
//   3. TASKS     scripts/email-agent.mjs          with --model-triage: shows the tasks it would create, then asks you to type yes
//                                                 before writing them to the app. (Skipped with --no-model, or when no API key is set.)
//   4. FILE      scripts/email-file.mjs           files mail you already finished in the app (done/dismissed tasks, matched receipts under $100). Run it again any day.
// Nothing is ever deleted and no mail is ever sent. Each step is the existing script, so its own safety rules still apply.
// Backing up a large mailbox takes a long time (about 150 messages a minute); the script can be re-run and resumes where it stopped.

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const accounts = (opt("--account") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const dest = opt("--dest") || "/Volumes/Rossiter 8TB/Mail Backup";
const keep = opt("--keep");
const NO_MODEL = args.includes("--no-model");
const forward = (opt("--forward") || "").split(" ").filter(Boolean);        // test hook: extra flags passed to every step
if (!accounts.length) { console.error("STOP: pass --account <address>[,<address>]"); process.exit(2); }

const run = (script, extra) => spawnSync(process.execPath, [join(here, script), ...extra, ...forward], { stdio: "inherit" }).status;
const rl = createInterface({ input: process.stdin, output: process.stdout });
const confirm = async (q) => (await rl.question(`\n${q} Type yes to go ahead, anything else to stop: `)).trim().toLowerCase() === "yes";
const banner = (t) => console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);

for (const account of accounts) {
  if (!existsSync(join(homedir(), "_secrets_local_only", "email-agent", `google-${account}.json`)) && !forward.length) { console.error(`STOP: no saved sign-in for ${account}. Run: node scripts/google-auth.mjs --account ${account}`); process.exit(2); }

  banner(`${account} — step 1 of 4: BACKUP`);
  if (run("gmail-backup.mjs", ["--account", account, "--dest", dest]) !== 0) {
    console.error(`\nSTOPPED: the backup for ${account} did not pass. Nothing was changed. Run this same command again; it resumes where it stopped.`); process.exit(1);
  }

  banner(`${account} — step 2 of 4: CLEANUP (dry run first)`);
  const cleanup = ["--account", account, "--q", "in:inbox", "--max", "20000", ...(keep ? ["--keep", keep] : [])];
  if (run("email-apply.mjs", cleanup) !== 0) { console.error("\nSTOPPED: the cleanup dry run failed. Nothing was changed."); process.exit(1); }
  if (await confirm(`Archive the messages listed above in ${account}? (nothing is deleted; an undo command is printed.)`)) {
    if (run("email-apply.mjs", [...cleanup, "--apply"]) !== 0) { console.error("\nSTOPPED: the cleanup did not finish cleanly. Check the output above before going on."); process.exit(1); }
  } else console.log("Skipped the cleanup for this account.");

  if (NO_MODEL) { console.log("\nSkipping step 3 (--no-model)."); continue; }
  banner(`${account} — step 3 of 4: TASKS (the small Claude model reads sender, subject and a short preview only)`);
  const agent = ["--account", account, "--model-triage"];
  if (run("email-agent.mjs", agent) !== 0) { console.error("\nSTOPPED: the task step failed. Nothing was written to the app."); process.exit(1); }
  if (await confirm(`Create the tasks listed above in the app for ${account}?`)) {
    if (run("email-agent.mjs", [...agent, "--apply"]) !== 0) { console.error("\nSTOPPED: writing the tasks did not finish cleanly."); process.exit(1); }
  } else console.log("Skipped creating tasks for this account.");

  banner(`${account} — step 4 of 4: FILE (mail you already dealt with in the app)`);
  if (run("email-file.mjs", ["--account", account]) !== 0) { console.error("\nSTOPPED: the filing dry run failed. Nothing was changed."); process.exit(1); }
  if (await confirm(`File the mail listed above in ${account}? (label Dashboard/Handled and out of the inbox; nothing is deleted.)`)) {
    if (run("email-file.mjs", ["--account", account, "--apply"]) !== 0) { console.error("\nSTOPPED: filing did not finish cleanly."); process.exit(1); }
  } else console.log("Skipped filing for this account.");

  banner(`${account} — done`);
}
rl.close();
console.log(`\nAll done for: ${accounts.join(", ")}.`);
