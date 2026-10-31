#!/usr/bin/env node
// StewardOS hub: the Mac mini's agents as switchable modules (D77/D78), with a doctor. Node 20+, no dependencies.
//
//   node scripts/hub.mjs                 # REPORT ONLY: hostname, env file, each module's prerequisite, what is installed, what would change
//   node scripts/hub.mjs --apply         # install or refresh the launchd job of every module whose prerequisite is met; nothing else
//   node scripts/hub.mjs --apply --only mail-sync,push-sender
//   node scripts/hub.mjs --json          # the report as JSON (for the Health page later)
//   node scripts/hub.mjs --apply --retire-legacy   # also unload every com.ryan.* job that has a running com.stewardos.* twin, and move its plist aside
//
// Rules:
//   • A module is ON only when its prerequisite exists on this Mac (a token file, an env key, a folder). No prerequisite, no job.
//   • Jobs are written as ~/Library/LaunchAgents/com.stewardos.<module>.plist, built for THIS user, repo path and node, with logs under
//     ~/StewardOS/logs. Only files with that prefix are ever written. Older com.ryan.* jobs are reported and left alone unless
//     --retire-legacy is passed, which unloads only those whose com.stewardos.* twin is seen running and renames the old plist to
//     .retired (never deleted).
//   • Rule D34 (2026-10-29): every agent on the hub is a module here and nowhere else. Adding an agent means adding a MODULES entry;
//     hand-written plists are gone from the repo. Only agents we want permanently in the product go in.
//   • A plist that already matches is left alone. A changed one is rewritten and reloaded (bootout + bootstrap). Nothing is deleted.
//   • Secrets stay in ~/_secrets_local_only (one env file: family-dashboard.env, names SUPABASE_URL / SUPABASE_SERVICE_KEY). Nothing is printed
//     from it except which keys are present.
//   • Not modules: dashboard-report (mini-report.sh, owned by the File Organization project) and bookmark-evening (Ryan's own). Both are reported as "personal".

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, renameSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const JSON_OUT = args.includes("--json");
const RETIRE = args.includes("--retire-legacy");
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
  { id: "hub-fetcher", script: "hub-fetcher.mjs", every: 15, needs: () => supabase, why: "needs the Supabase keys in the env file", powers: "the app's fetch requests (pull, never push)" },
  { id: "statement-agent", script: "statement-agent.mjs", every: 30, needs: () => supabase && existsSync(join(REPO, "scripts", "ocr", "stewardos-ocr")), why: "needs the OCR tool built (swiftc -O -o scripts/ocr/stewardos-ocr scripts/ocr/stewardos-ocr.swift)", powers: "Money › Statements: reads uploaded statements on this Mac with local OCR, no AI" },
  { id: "statement-copies", script: "statement-copies.mjs", every: 600, needs: () => supabase && existsSync(join(HOME, "Organized")), why: "needs ~/Organized (the filing tree)", powers: "Money › Statements: a local copy of every statement filed from the Inbox (copy only)" },
  { id: "tx-match", script: "tx-match.mjs", every: 3600, needs: () => supabase, why: "needs the Supabase keys in the env file", powers: "Money: links receipts to ledger lines, sets cards", extraArgs: () => ["--apply"] },
  { id: "vault-import", script: "vault-folder.mjs", keepAlive: true, needs: () => supabase && canRun("op"), why: "needs the 1Password CLI (op) on this Mac", powers: "Settings › 1Password › Map your documents (watches ~/StewardOS/Import)", extraArgs: () => ["--serve"] },
  { id: "catalog-walker", script: "catalog-walker.mjs", every: 600, needs: () => supabase && existsSync(join(HOME, "Organized")), why: "needs ~/Organized (the document tree)", powers: "Ask: the document catalog (text stays on the hub)", extraArgs: () => ["--sweep"] },
  { id: "contact-geo", script: "contact-geo.mjs", every: 3600, needs: () => supabase, why: "needs the Supabase keys in the env file", powers: "Contacts: addresses on the map" },
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
const PERSONAL = ["com.ryan.dashboard-report", "com.ryan.nightly-mirror", "com.ryan.bookmark-evening", "com.ryan.publish-materials"];

function canRead(p) { try { readFileSync(p, { flag: "r" }).length; return true; } catch { return false; } }
function canRun(bin) { return ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].some((d) => existsSync(join(d, bin))); }

function plistFor(m) {
  const argsXml = [nodeBin, join(REPO, "scripts", m.script), ...(m.extraArgs ? m.extraArgs() : [])].map((a) => `<string>${a.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string>`).join("");
  const log = join(LOGS, `${m.id}.log`);
  const timing = m.keepAlive ? `<key>KeepAlive</key><true/>\n  <key>ThrottleInterval</key><integer>10</integer>` : `<key>StartInterval</key><integer>${m.every}</integer>`;
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
    // launchd answers "Input/output error" (5) when asked to load a job it is still tearing down -- seen on the always-on
    // messages-mirror, 2026-10-29. Wait a moment and try once more before calling it a failure.
    let b = spawnSync("launchctl", ["bootstrap", domain, file], { encoding: "utf8" });
    if (b.status !== 0 && /Input\/output error|: 5:/.test(b.stderr || "")) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); b = spawnSync("launchctl", ["bootstrap", domain, file], { encoding: "utf8" }); }
    row.loaded = b.status === 0; row.state = b.status === 0 ? "ok" : "load-failed";
    report.changes.push(`${state === "install" ? "installed" : state === "load" ? "loaded" : "updated"} ${label}${b.status === 0 ? "" : ` (bootstrap failed: ${(b.stderr || "").trim()})`}`);
  }
  // --retire-legacy: an old com.ryan.<module> job is unloaded only when its com.stewardos.<module> twin is loaded right now,
  // so nothing ever stops running. The old plist is renamed .retired, never deleted. Personal jobs are never touched.
  report.retired = [];
  if (APPLY && RETIRE) {
    const now = loadedLabels();
    for (const r of report.modules) {
      const old = `com.ryan.${r.id}`, oldFile = join(AGENTS, `${old}.plist`);
      if (!r.on || !now.has(PREFIX + r.id) || !(now.has(old) || existsSync(oldFile))) continue;
      spawnSync("launchctl", ["bootout", `gui/${uid()}/${old}`], { stdio: "ignore" });
      if (existsSync(oldFile)) renameSync(oldFile, `${oldFile}.retired`);
      r.legacyLoaded = false; report.retired.push(old);
    }
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
  if (report.retired.length) console.log(`\nRetired old jobs (plist kept as .retired): ${report.retired.join(", ")}`);
  const overlap = report.modules.filter((r) => r.on && r.loaded && r.legacyLoaded);
  if (overlap.length) console.log(`\nBoth old and new jobs are loaded for: ${overlap.map((r) => r.id).join(", ")}. Each runs twice until the old one is retired:\n  node scripts/hub.mjs --apply --retire-legacy`);
}
if (process.argv[1] && process.argv[1].endsWith("hub.mjs")) main();
