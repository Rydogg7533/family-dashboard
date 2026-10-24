#!/usr/bin/env node
// StewardOS hub: the Mac mini's agents as switchable modules (D77/D78), with a doctor. Node 20+, no dependencies.
//
//   node scripts/hub.mjs                 # REPORT ONLY: hostname, env file, each module's prerequisite, what is installed, what would change
//   node scripts/hub.mjs --apply         # install or refresh the launchd job of every module whose prerequisite is met; nothing else
//   node scripts/hub.mjs --apply --only mail-sync,push-sender
//   node scripts/hub.mjs --json          # the report as JSON (for the Health page later)
//
// Rules:
//   • A module is ON only when its prerequisite exists on this Mac (a token file, an env key, a folder). No prerequisite, no job.
//   • Jobs are written as ~/Library/LaunchAgents/com.stewardos.<module>.plist, built for THIS user, repo path and node, with logs under
//     ~/StewardOS/logs. Only files with that prefix are ever written. Older com.ryan.* jobs are reported, never touched: unload them by hand
//     once the com.stewardos.* copy is seen running (the report says which ones overlap).
//   • A plist that already matches is left alone. A changed one is rewritten and reloaded (bootout + bootstrap). Nothing is deleted.
//   • Secrets stay in ~/_secrets_local_only (one env file: family-dashboard.env, names SUPABASE_URL / SUPABASE_SERVICE_KEY). Nothing is printed
//     from it except which keys are present.
//   • Not modules: dashboard-report (mini-report.sh, owned by the File Organization project) and bookmark-evening (Ryan's own). Both are reported as "personal".

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const JSON_OUT = args.includes("--json");
const ONLY = (() => { const i = args.indexOf("--only"); return i >= 0 ? new Set(args[i + 1].split(",").map((s) => s.trim())) : null; })();

const HOME = homedir();
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const SECRETS = join(HOME, "_secrets_local_only");
const ENV_FILE = join(SECRETS, "family-dashboard.env");
const EMAIL_DIR = join(SECRETS, "email-agent");
const LOGS = join(HOME, "StewardOS", "logs");
const AGENTS = join(HOME, "Library", "LaunchAgents");
const PREFIX = "com.stewardos.";

const readEnv = (p) => { const o = {}; if (!existsSync(p)) return o; for (const line of readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return o; };
const env = readEnv(ENV_FILE);
const has = (...keys) => keys.every((k) => (env[k] || "").length > 0);
const supabase = (has("SUPABASE_URL") || has("NEXT_PUBLIC_SUPABASE_URL")) && (has("SUPABASE_SERVICE_KEY") || has("SUPABASE_SERVICE_ROLE_KEY"));
const emailFiles = existsSync(EMAIL_DIR) ? readdirSync(EMAIL_DIR) : [];
const mailboxTokens = emailFiles.filter((f) => /^google-.+@.+\.json$/.test(f) && !/\.(contacts|calendar|sheets)\.json$/.test(f));
const contactsTokens = emailFiles.filter((f) => /\.contacts\.json$/.test(f));
const icloudMail = emailFiles.filter((f) => /^icloud-.+\.env$/.test(f));
const imapEnvs = emailFiles.filter((f) => /^imap-.+@.+\.env$/.test(f));
const icloudContacts = Object.keys(env).some((k) => /^ICLOUD_CONTACTS_\d+$/.test(k));
const nodeBin = (() => { for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node", process.execPath]) if (existsSync(p)) return p; return process.execPath; })();

// Each module: what it runs, how often, and the prerequisite that switches it on. `why` is shown when it is off.
export const MODULES = [
  { id: "push-sender", script: "push-sender.mjs", every: 30, needs: () => supabase && has("VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY"), why: "needs VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY in the env file (node scripts/make-vapid.mjs)", powers: "push notifications" },
  { id: "location-agent", script: "location-agent.mjs", every: 600, needs: () => supabase, why: "needs the Supabase keys in the env file", powers: "Day page: stops, Places, questions" },
  { id: "filing-agent", script: "filing-agent.mjs", every: 600, needs: () => supabase && existsSync(join(HOME, "Organized")), why: "needs ~/Organized (the filing tree)", powers: "Inbox › file into Organized" },
  { id: "mail-sync", script: "mail-sync.mjs", every: 300, needs: () => supabase && mailboxTokens.length > 0, why: "needs a Gmail sign-in (node scripts/google-auth.mjs --account <address>)", powers: "Mail (Gmail inbox and drafts)" },
  { id: "imap-mail-sync", script: "imap-mail-sync.mjs", every: 300, needs: () => supabase && imapEnvs.length > 0, why: "needs a mailbox connected with an app password (node scripts/mail-connect.mjs)", powers: "Mail over IMAP (Gmail, iCloud, other)" },
  { id: "icloud-mail-sync", script: "icloud-mail-sync.mjs", every: 300, needs: () => supabase && icloudMail.length > 0, why: "needs email-agent/icloud-<name>.env (app-specific password)", powers: "Mail (iCloud inbox and drafts)" },
  { id: "contacts-sync", script: "contacts-sync.mjs", every: 1800, needs: () => supabase && icloudContacts, why: "needs ICLOUD_CONTACTS_1 in the env file", powers: "Apple Contacts, read" },
  { id: "contacts-push", script: "contacts-push.mjs", every: 120, needs: () => supabase && icloudContacts, why: "needs ICLOUD_CONTACTS_1 in the env file", powers: "Apple Contacts, write-back" },
  { id: "google-contacts-sync", script: "google-contacts-sync.mjs", every: 1800, needs: () => supabase && contactsTokens.length > 0, why: "needs a Google contacts sign-in (google-auth.mjs --purpose contacts)", powers: "Google Contacts, read" },
  { id: "google-contacts-push", script: "google-contacts-push.mjs", every: 120, needs: () => supabase && contactsTokens.length > 0, why: "needs a Google contacts sign-in", powers: "Google Contacts, write-back and delete" },
  { id: "email-unsubscribe", script: "email-unsubscribe.mjs", every: 600, needs: () => supabase && mailboxTokens.length > 0, why: "needs a Gmail sign-in", powers: "Email subscriptions: unsubscribe requests" },
  { id: "email-subscriptions", script: "email-subscriptions.mjs", every: 10800, needs: () => supabase && mailboxTokens.length > 0, why: "needs a Gmail sign-in", powers: "Email subscriptions: finding mailing lists",
    extraArgs: () => ["--account", mailboxTokens[0].replace(/^google-/, "").replace(/\.json$/, ""), "--days", "3"] },
  { id: "messages-mirror", script: "messages-mirror.mjs", keepAlive: true, needs: () => supabase && has("MIRROR_PERSON_ID") && canRead(join(HOME, "Library", "Messages", "chat.db")), why: "needs MIRROR_PERSON_ID in the env file and Full Disk Access to Messages (advanced)", powers: "Messages mirror", extraArgs: () => ["--watch"] },
];
const PERSONAL = ["com.ryan.dashboard-report", "com.ryan.nightly-mirror", "com.ryan.bookmark-evening"];

function canRead(p) { try { readFileSync(p, { flag: "r" }).length; return true; } catch { return false; } }

function plistFor(m) {
  const argsXml = [nodeBin, join(REPO, "scripts", m.script), ...(m.extraArgs ? m.extraArgs() : [])].map((a) => `<string>${a.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string>`).join("");
  const log = join(LOGS, `${m.id}.log`);
  const timing = m.keepAlive ? `<key>KeepAlive</key><true/>` : `<key>StartInterval</key><integer>${m.every}</integer>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${PREFIX}${m.id}</string>
  <key>ProgramArguments</key><array>${argsXml}</array>
  ${timing}
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`;
}

function loadedLabels() {
  const r = spawnSync("launchctl", ["list"], { encoding: "utf8" });
  if (r.status !== 0) return new Set();
  return new Set(r.stdout.split("\n").map((l) => l.trim().split(/\s+/).pop()).filter(Boolean));
}
const uid = () => { try { return execFileSync("id", ["-u"], { encoding: "utf8" }).trim(); } catch { return String(process.getuid?.() ?? ""); } };

function main() {
  const loaded = loadedLabels();
  const legacy = existsSync(AGENTS) ? readdirSync(AGENTS).filter((f) => f.startsWith("com.ryan.") && f.endsWith(".plist")).map((f) => f.replace(/\.plist$/, "")) : [];
  const report = {
    host: hostname(), user: userInfo().username, repo: REPO, node: nodeBin,
    envFile: existsSync(ENV_FILE) ? { present: true, keys: Object.keys(env).sort() } : { present: false, keys: [] },
    secrets: { gmailMailboxes: mailboxTokens.length, imapMailboxes: imapEnvs.length, googleContactsSignins: contactsTokens.length, icloudMailAccounts: icloudMail.length, icloudContacts },
    modules: [], personal: PERSONAL.map((l) => ({ label: l, loaded: loaded.has(l) })), changes: [],
  };
  for (const m of MODULES) {
    const on = !!m.needs();
    const label = PREFIX + m.id, file = join(AGENTS, `${label}.plist`);
    const want = on ? plistFor(m) : null;   // a module that is off has nothing to build (its prerequisites may be missing)
    const have = existsSync(file) ? readFileSync(file, "utf8") : null;
    // "load": the plist is right but launchd does not have it (written earlier, never bootstrapped, or unloaded by hand)
    const state = !on ? "off" : have === null ? "install" : have !== want ? "update" : loaded.has(label) ? "ok" : "load";
    const legacyLabel = `com.ryan.${m.id}`;
    const row = { id: m.id, powers: m.powers, on, why: on ? null : m.why, state, loaded: loaded.has(label), legacyLoaded: loaded.has(legacyLabel) || legacy.includes(legacyLabel) };
    report.modules.push(row);
    if (!on || state === "ok" || (ONLY && !ONLY.has(m.id))) continue;
    if (!APPLY) { report.changes.push(`${state} ${label}`); continue; }
    mkdirSync(LOGS, { recursive: true }); mkdirSync(AGENTS, { recursive: true });
    if (state !== "load") writeFileSync(file, want, { mode: 0o644 });
    const domain = `gui/${uid()}`;
    spawnSync("launchctl", ["bootout", `${domain}/${label}`], { stdio: "ignore" });     // fine if it was not loaded
    const b = spawnSync("launchctl", ["bootstrap", domain, file], { encoding: "utf8" });
    row.loaded = b.status === 0; row.state = b.status === 0 ? "ok" : "load-failed";
    report.changes.push(`${state === "install" ? "installed" : state === "load" ? "loaded" : "updated"} ${label}${b.status === 0 ? "" : ` (bootstrap failed: ${(b.stderr || "").trim()})`}`);
  }
  if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); return; }

  console.log(`StewardOS hub on ${report.host} (user ${report.user})${APPLY ? "" : "  — REPORT ONLY, nothing changed (add --apply)"}`);
  console.log(`  repo ${REPO}\n  node ${nodeBin}`);
  console.log(`  env file ${ENV_FILE}: ${report.envFile.present ? `present, keys: ${report.envFile.keys.join(", ")}` : "MISSING"}`);
  console.log(`  sign-ins: ${mailboxTokens.length} Gmail API, ${imapEnvs.length} IMAP mailboxes, ${contactsTokens.length} Google contacts, ${icloudMail.length} iCloud mail (old style), iCloud contacts ${icloudContacts ? "yes" : "no"}`);
  console.log("\nModules");
  for (const r of report.modules) {
    const mark = !r.on ? "·" : r.state === "ok" && r.loaded ? "✓" : r.state === "ok" ? "~" : "→";
    const note = !r.on ? `off: ${r.why}` : r.state === "ok" ? "installed and loaded" : r.state === "install" ? "would install" : r.state === "update" ? "would update (plist differs)" : r.state === "load" ? "installed but not loaded: would load" : r.state;
    console.log(`  ${mark} ${r.id.padEnd(22)} ${note}${r.legacyLoaded ? `   [com.ryan.${r.id} also present]` : ""}`);
  }
  console.log("\nPersonal jobs (not part of the kit, left alone)");
  for (const p of report.personal) console.log(`  ${p.loaded ? "✓" : "·"} ${p.label}${p.loaded ? " loaded" : " not loaded"}`);
  if (report.changes.length) console.log(`\n${APPLY ? "Changes made" : "Would change"}:\n  ${report.changes.join("\n  ")}`);
  else console.log("\nNo changes needed.");
  const overlap = report.modules.filter((r) => r.on && r.loaded && r.legacyLoaded);
  if (overlap.length) console.log(`\nBoth old and new jobs are loaded for: ${overlap.map((r) => r.id).join(", ")}. Each runs twice until the old one is unloaded:\n  launchctl bootout gui/$(id -u)/com.ryan.<module>   (and move the plist out of ~/Library/LaunchAgents)`);
}
if (process.argv[1] && process.argv[1].endsWith("hub.mjs")) main();
