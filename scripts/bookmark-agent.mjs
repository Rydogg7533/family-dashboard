#!/usr/bin/env node
// Bookmark agent, phase 1 (READ-ONLY): finds every browser and profile on this Mac, reads its bookmarks into one master list,
// notices browsers/profiles it has not seen before, and previews which email-list senders already have a bookmark.
// It NEVER writes to a browser, never deletes, never overwrites: snapshots are new dated files; browser files are only read (databases
// are copied to a temp folder first so a running browser is never disturbed).
//
//   node scripts/bookmark-agent.mjs --dry      # read and report only; writes no files at all
//   node scripts/bookmark-agent.mjs            # also saves a dated snapshot + source list in ~/Organized/_Bookmarks/
//
// The bookmark list itself stays on this Mac. Nothing about it is sent anywhere in this phase.
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildPlan } from "./bookmark-plan-lib.mjs";
import { parseChromium, parseSafari, parseFirefox, buildIndex, matchSender } from "./bookmarks-lib.mjs";

const DRY = process.argv.includes("--dry");
const HOME = homedir();
const SUPPORT = join(HOME, "Library", "Application Support");
const OUT = join(HOME, "Organized", "_Bookmarks");
const appInstalled = (name) => existsSync(`/Applications/${name}.app`) || existsSync(join(HOME, "Applications", `${name}.app`));
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

const sources = [];   // { key, browser, profile, account, count, readingList?, note? }
const all = [];       // every bookmark record

// ---- Chrome, Edge, Brave, Vivaldi, Chromium
const CHROMIUM = [["Chrome", "Google Chrome", "Google/Chrome"], ["Edge", "Microsoft Edge", "Microsoft Edge"], ["Brave", "Brave Browser", "BraveSoftware/Brave-Browser"], ["Vivaldi", "Vivaldi", "Vivaldi"], ["Chromium", "Chromium", "Chromium"]];
for (const [label, app, dir] of CHROMIUM) {
  if (!appInstalled(app)) continue;
  const base = join(SUPPORT, dir);
  let entries = []; try { entries = readdirSync(base).filter((n) => n === "Default" || /^Profile \d+$/.test(n)); } catch { /* no data folder */ }
  for (const folder of entries) {
    const prefs = readJson(join(base, folder, "Preferences")) || {};
    const name = prefs.profile?.name || folder;
    const account = prefs.account_info?.[0]?.email || null;
    const bm = readJson(join(base, folder, "Bookmarks"));
    const recs = bm ? parseChromium(bm, label, name) : [];
    all.push(...recs);
    sources.push({ key: `${label}/${folder}`, browser: label, profile: name, account, count: recs.length, note: bm ? null : "no bookmarks file yet" });
  }
}

// ---- Firefox (places.sqlite copied to a temp folder, then read with the sqlite3 that ships with macOS)
if (appInstalled("Firefox")) {
  const base = join(SUPPORT, "Firefox", "Profiles");
  let profiles = []; try { profiles = readdirSync(base); } catch { /* none */ }
  for (const folder of profiles) {
    const db = join(base, folder, "places.sqlite");
    if (!existsSync(db)) { sources.push({ key: `Firefox/${folder}`, browser: "Firefox", profile: folder, account: null, count: 0, note: "empty profile" }); continue; }
    const tmp = mkdtempSync(join(tmpdir(), "bm-ff-"));
    try {
      copyFileSync(db, join(tmp, "places.sqlite")); if (existsSync(db + "-wal")) copyFileSync(db + "-wal", join(tmp, "places.sqlite-wal"));
      const q = (sql) => JSON.parse(execFileSync("/usr/bin/sqlite3", ["-json", join(tmp, "places.sqlite"), sql], { maxBuffer: 200e6 }).toString() || "[]");
      const urls = q("select b.title as title, p.url as url, b.parent as parent, b.dateAdded as dateAdded from moz_bookmarks b join moz_places p on b.fk = p.id where b.type = 1 and p.url like 'http%'");
      const folders = q("select id, parent, title from moz_bookmarks where type = 2");
      const recs = parseFirefox(urls, folders, "Firefox", folder.replace(/^[a-z0-9]+\./, ""));
      all.push(...recs); sources.push({ key: `Firefox/${folder}`, browser: "Firefox", profile: folder.replace(/^[a-z0-9]+\./, ""), account: null, count: recs.length });
    } catch (e) { sources.push({ key: `Firefox/${folder}`, browser: "Firefox", profile: folder, account: null, count: 0, note: `could not read (${String(e.message).split("\n")[0].slice(0, 80)})` }); }
    finally { rmSync(tmp, { recursive: true, force: true }); }
  }
}

// ---- Safari (python3 ships with macOS; reading needs the Terminal / launchd job to have Full Disk Access)
{
  const plist = join(HOME, "Library", "Safari", "Bookmarks.plist");
  if (existsSync(plist)) {
    try {
      // plutil's JSON converter refuses Safari's file (it holds binary data and dates), so Python's plistlib reads it instead and drops those fields.
      const py = "import plistlib,json,sys\nd=plistlib.load(open(sys.argv[1],'rb'))\nprint(json.dumps(d,default=lambda o: None))";
      const json = JSON.parse(execFileSync("/usr/bin/python3", ["-c", py, plist], { maxBuffer: 500e6, stdio: ["ignore", "pipe", "pipe"] }).toString());
      const { bookmarks, readingList } = parseSafari(json);
      all.push(...bookmarks); sources.push({ key: "Safari/Default", browser: "Safari", profile: "Default", account: null, count: bookmarks.length, readingList });
    } catch (e) {
      const msg = String(e.stderr || e.message).trim().split("\n").pop().slice(0, 140);
      const perm = /not permitted|permission/i.test(msg);
      sources.push({ key: "Safari/Default", browser: "Safari", profile: "Default", account: null, count: 0, note: perm ? `NOT READABLE: macOS is blocking it (${msg}). Give Terminal Full Disk Access, quit and reopen Terminal, run again` : `NOT READABLE: ${msg}` });
    }
  }
}

// ---- report
const state = (() => { try { return JSON.parse(readFileSync(join(OUT, "sources.json"), "utf8")); } catch { return null; } })();
const known = new Set((state?.sources || []).map((s) => s.key));
console.log(`${DRY ? "DRY RUN (writes no files) — " : ""}bookmark agent, read-only\n`);
console.log("Browsers and profiles found:");
for (const s of sources) console.log(`  ${s.browser.padEnd(8)} ${String(s.profile).padEnd(18)} ${String(s.count).padStart(5)} bookmarks${s.readingList ? ` (+${s.readingList} in Reading List)` : ""}${s.account ? `  [${s.account}]` : ""}${s.note ? `  — ${s.note}` : ""}${state && !known.has(s.key) ? "  ← NEW since last run" : ""}`);
const uniqueUrls = new Set(all.map((b) => b.url.replace(/\/$/, "")));
const sites = new Set(all.map((b) => b.site));
console.log(`\nMaster list: ${all.length} bookmarks, ${uniqueUrls.size} different addresses, ${sites.size} different sites.`);
const dupSites = [...sites].filter((s) => new Set(all.filter((b) => b.site === s).map((b) => `${b.browser}/${b.profile}`)).size > 1).length;
console.log(`${dupSites} sites are bookmarked in more than one browser or profile.`);

// ---- --folders: how the bookmarks are organised today (folder names and counts only, never the bookmarks themselves)
if (process.argv.includes("--folders")) {
  const by = new Map();
  for (const b of all) { const k = `${b.browser} / ${b.profile}`; if (!by.has(k)) by.set(k, new Map()); const parts = b.folder ? b.folder.split(" › ") : ["(no folder)"]; for (const depth of [1, 2]) { if (depth > parts.length) break; const f = parts.slice(0, depth).join(" › "); by.get(k).set(f, (by.get(k).get(f) || 0) + (depth === parts.length || depth === 2 ? 1 : 0)); } }
  console.log("\nFolders today (top 2 levels; count = bookmarks sitting directly under that path):");
  for (const [k, m] of by) { console.log(`\n${k}`); for (const [f, n] of [...m].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(n).padStart(5)}  ${f}`); }
}

// ---- --contents: what is in each folder (top sites per folder), so a better structure can be designed from the real material
if (process.argv.includes("--contents")) {
  const f = new Map();
  for (const b of all) { const k = `${b.browser}/${b.profile} › ${b.folder.split(" › ").slice(0, 2).join(" › ") || "(none)"}`; if (!f.has(k)) f.set(k, { n: 0, sites: new Map() }); const e = f.get(k); e.n++; e.sites.set(b.site, (e.sites.get(b.site) || 0) + 1); }
  console.log("\nFolder contents (folder: bookmarks | top sites with counts):");
  for (const [k, e] of [...f].sort((a, b) => b[1].n - a[1].n).slice(0, 45)) console.log(`${String(e.n).padStart(4)}  ${k}  |  ${[...e.sites].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([s, n]) => `${s}${n > 1 ? ` x${n}` : ""}`).join(", ")}`);
}

// ---- --sites "folder name": every site in matching folders with counts and one sample title, to design subfolders for big folders
{
  const i = process.argv.indexOf("--sites");
  if (i >= 0) {
    const needle = String(process.argv[i + 1] || "").toLowerCase();
    const inF = all.filter((b) => b.folder.toLowerCase().includes(needle));
    const m = new Map(); for (const b of inF) { if (!m.has(b.site)) m.set(b.site, { n: 0, title: b.title }); m.get(b.site).n++; }
    console.log(`\nSites in folders matching "${needle}" (${inF.length} bookmarks, ${m.size} sites): site x count | sample title`);
    for (const [site, e] of [...m].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) console.log(`${site} x${e.n} | ${e.title.slice(0, 50)}`);
  }
}

// ---- --plan: where every bookmark WOULD go in the approved master tree (prints only; moves nothing)
if (process.argv.includes("--plan")) {
  const { rows, byTarget, conf } = buildPlan(all);
  console.log(`\nMOVE PLAN (proposal only, nothing is changed): ${rows.length} bookmarks. Confidence: ${conf.high} high, ${conf.medium} medium, ${conf.low} low.`);
  console.log("\nHow many would land in each folder:");
  for (const [t, n] of [...byTarget].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${String(n).padStart(5)}  ${t}`);
  console.log("\nEvery bookmark: confidence | from | to | site | title | why");
  for (const r of rows.sort((a, b) => ({ low: 0, medium: 1, high: 2 })[a.confidence] - ({ low: 0, medium: 1, high: 2 })[b.confidence] || a.target.localeCompare(b.target))) console.log(`${r.confidence} | ${r.b.browser}/${r.b.profile} › ${r.b.folder || "(none)"} | ${r.target} | ${r.b.site} | ${r.b.title.slice(0, 50)} | ${r.reason}`);
}

// ---- --loose: only the unfiled bookmarks (no folder, Link Dump, Other Bookmarks, Firefox defaults), so they can be sorted into the master tree
if (process.argv.includes("--loose")) {
  const loose = all.filter((b) => !b.folder || /^(Link Dump|Other Bookmarks|Bookmarks Menu › Mozilla Firefox|Bookmarks bar|Veil Labs|Broadbeach)/i.test(b.folder) || /^Other Bookmarks/i.test(b.folder));
  console.log(`\nUnfiled (${loose.length}): browser | folder | site | title`);
  for (const b of loose) console.log(`${b.browser}/${b.profile} | ${b.folder || "(none)"} | ${b.site} | ${b.title.slice(0, 60)}`);
}

// ---- preview: which email-list senders already have a bookmark? (reads the dashboard database; writes nothing)
async function preview() {
  const envPath = join(HOME, "_secrets_local_only", "family-dashboard.env"); const env = {};
  try { for (const line of readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { return; }
  const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY; if (!URL || !KEY) return;
  const r = await fetch(`${URL}/rest/v1/email_subscriptions?status=eq.active&deleted_at=is.null&select=sender_name,domain,category&limit=2000`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) { console.log(`\n(Could not read email lists: HTTP ${r.status})`); return; }
  const rows = await r.json(); const idx = buildIndex(all); const tally = { bookmarked: 0, missing: 0, unknown: 0 }; const missing = new Map();
  for (const row of rows) { const m = matchSender(row.domain, idx); tally[m.status]++; if (m.status === "missing") missing.set(m.site, row.sender_name || m.site); }
  console.log(`\nEmail lists vs bookmarks (${rows.length} active lists): ${tally.bookmarked} already bookmarked, ${tally.missing} with no bookmark, ${tally.unknown} unknown (shared newsletter platforms).`);
  if (missing.size) console.log("No bookmark yet: " + [...missing].slice(0, 25).map(([site, name]) => `${name} (${site})`).join(", ") + (missing.size > 25 ? `, and ${missing.size - 25} more` : ""));
}
await preview().catch((e) => console.log(`\n(Preview skipped: ${e.message})`));

if (DRY) { console.log("\nDRY RUN: nothing written."); process.exit(0); }
mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10); let file = join(OUT, `snapshot-${stamp}.json`);
if (existsSync(file)) file = join(OUT, `snapshot-${stamp}-${new Date().toISOString().slice(11, 16).replace(":", "")}.json`);
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), sources, bookmarks: all }), { flag: "wx", mode: 0o600 });
writeFileSync(join(OUT, "sources.json"), JSON.stringify({ at: new Date().toISOString(), sources: sources.map(({ key, browser, profile, count }) => ({ key, browser, profile, count })) }, null, 1), { mode: 0o600 });
console.log(`\nPASS — saved ${file.replace(HOME, "~")} (${all.length} bookmarks). Browsers untouched.`);
