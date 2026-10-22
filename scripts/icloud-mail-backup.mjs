#!/usr/bin/env node
// iCloud Mail → local backup (copy-only). Run by hand on the Mac mini before any mail is reorganised.
//
// Downloads every message from every selectable folder over IMAP as raw .eml files, one directory per
// folder, plus a manifest (size, SHA-256, flags, internal date) so a later restore or undo is possible.
//
//   node scripts/icloud-mail-backup.mjs --dest "/Volumes/<drive>/Mail Backup" --dry   # counts + sizes only
//   node scripts/icloud-mail-backup.mjs --dest "/Volumes/<drive>/Mail Backup"         # the real copy (4 connections; --workers 1-6)
//
// Safety rules (same as the other agents):
//   - READ-ONLY on the mailbox: folders are opened with EXAMINE, bodies fetched with BODY.PEEK, so nothing is
//     marked read, moved, flagged or deleted. The script has no code path that writes to the mailbox.
//   - NEVER overwrites a backup file: files are created with link() which fails if the name exists, and a
//     re-run skips messages already saved (so it is resumable). Only its own *.part temp files are removed.
//   - The destination's parent folder must already exist (an unmounted drive never creates a stray folder
//     on the Mac mini's own disk) and there must be room for the whole mailbox plus 5 GB.
//   - The password is read from ~/_secrets_local_only/email-agent/icloud-ryan.env and never printed.
//
// Layout:  <dest>/icloud-mail-ryan/<folder path>/<uidvalidity>-<uid>.eml, manifest.jsonl, _folder.json
//          <dest>/icloud-mail-ryan/REPORT.txt  (per-folder server count vs files on disk)

import { readFileSync, existsSync, mkdirSync, statfsSync, linkSync, unlinkSync, statSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag("--dry");
const DEST_PARENT = opt("--dest");
const ENV_PATH = opt("--env") || join(homedir(), "_secrets_local_only", "email-agent", "icloud-ryan.env");
const LABEL = opt("--label") || "icloud-mail-ryan";
const WORKERS = Math.min(6, Math.max(1, parseInt(opt("--workers") || "4", 10) || 4));
const GIB = 1024 ** 3;

function die(msg) { console.error(`STOP: ${msg}`); process.exit(2); }
if (!DEST_PARENT) die('pass --dest "<existing folder>" (e.g. a folder on the 8TB drive)');
if (!existsSync(DEST_PARENT) || !statSync(DEST_PARENT).isDirectory()) die(`${DEST_PARENT} does not exist (is the drive mounted?). Nothing was created.`);
const DEST = join(DEST_PARENT, LABEL);

// ---------- env ----------
const env = {};
try {
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { die(`cannot read ${ENV_PATH}`); }
const USER = env.ICLOUD_MAIL_USER, PASS = env.ICLOUD_MAIL_APP_PASSWORD;
if (!USER || !PASS) die("ICLOUD_MAIL_USER / ICLOUD_MAIL_APP_PASSWORD missing in the env file");

// ---------- helpers ----------
const segment = (s) =>
  s.replace(/[\x00-\x1f/\\:]/g, "_").replace(/^\./, "_").replace(/ +$/, (m) => "_".repeat(m.length)).replace(/\.+$/, (m) => "_".repeat(m.length)) || "_";
const fmtGB = (b) => (b / GIB).toFixed(2) + " GB";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const c = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
  c.on("error", (e) => console.error(`  (connection error: ${e.code || e.message})`));
  await c.connect();
  return c;
}

async function listFolders(client) {
  const all = await client.list();
  return all.filter((f) => !f.flags?.has("\\Noselect") && !f.flags?.has("\\NonExistent")).sort((a, b) => a.path.localeCompare(b.path));
}

// Metadata for one folder (EXAMINE only). Returns { uidValidity, messages:[{uid,size,flags,internalDate}] }.
async function folderMeta(client, path) {
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    const uidValidity = String(client.mailbox.uidValidity);
    if (!client.mailbox.exists) return { uidValidity, messages: [] };
    const rows = await client.fetchAll("1:*", { uid: true, size: true, flags: true, internalDate: true });
    return {
      uidValidity,
      messages: rows.map((m) => ({ uid: m.uid, size: m.size, flags: [...(m.flags || [])], internalDate: m.internalDate ? new Date(m.internalDate).toISOString() : null })),
    };
  } finally { lock.release(); }
}

// Writes one message that was already fetched into memory. Never overwrites: the file is built under a .part name,
// then link()ed to its final name, which fails if that name exists. Returns null when it already existed.
function saveBuffer(dir, uidValidity, m, buf) {
  const final = join(dir, `${uidValidity}-${m.uid}.eml`);
  if (existsSync(final) && statSync(final).size > 0) return null;
  if (!buf || buf.length === 0) throw new Error(`uid ${m.uid}: empty message`);
  const part = final + ".part";
  writeFileSync(part, buf); // our own temp file; overwriting a leftover .part from a stopped run is fine
  linkSync(part, final);
  unlinkSync(part);
  return { bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), sizeMismatch: m.size && buf.length !== m.size ? { server: m.size, got: buf.length } : null };
}

// ---------- main ----------
async function main() {
  console.log(`${DRY ? "DRY RUN (nothing downloaded)" : "BACKUP"} — iCloud mail for ${USER.replace(/(.).*(@.*)/, "$1***$2")}`);
  let client = await connect();
  const folders = await listFolders(client);
  console.log(`${folders.length} selectable folders`);

  // pass 1: read-only inventory
  const inv = [];
  let totalMsgs = 0, totalBytes = 0;
  for (const f of folders) {
    let meta;
    for (let a = 1; a <= 3; a++) {
      try { meta = await folderMeta(client, f.path); break; }
      catch (e) { console.error(`  ${f.path}: inventory attempt ${a} failed: ${e.message}`); if (a === 3) throw e; await sleep(2000); try { await client.logout(); } catch {} client = await connect(); }
    }
    const bytes = meta.messages.reduce((s, m) => s + (m.size || 0), 0);
    inv.push({ folder: f, ...meta, bytes });
    totalMsgs += meta.messages.length; totalBytes += bytes;
    console.log(`  ${String(meta.messages.length).padStart(7)} msgs  ${fmtGB(bytes).padStart(10)}  ${f.path}`);
  }
  console.log(`TOTAL: ${totalMsgs} messages, ${fmtGB(totalBytes)}`);

  const free = (() => { const s = statfsSync(DEST_PARENT); return s.bavail * s.bsize; })();
  console.log(`Free space at destination: ${fmtGB(free)}; needed: ${fmtGB(totalBytes)} + 5 GB headroom`);
  if (free < totalBytes + 5 * GIB) die("not enough free space at the destination. Nothing was downloaded.");
  if (DRY) { console.log("Dry run finished. Re-run without --dry to copy."); await client.logout(); return; }

  // pass 2: copy. Messages are fetched in batches (one FETCH per batch, not one per message) by several
  // connections at once, because iCloud's per-request delay, not bandwidth, is what makes this slow.
  if (!existsSync(DEST)) mkdirSync(DEST); // leaf only; parent must exist
  const report = [`iCloud mail backup — ${new Date().toISOString()}`, `account: ${USER}`, ""];
  let problems = 0, warnings = 0, newFiles = 0;
  const failedBy = new Map(); // folder path -> count of messages that could not be saved
  const tasks = [];
  let alreadyHave = 0, toGet = 0;
  const prepared = [];
  for (const item of inv) {
    const { folder, uidValidity, messages } = item;
    const dir = join(DEST, ...folder.path.split(folder.delimiter || "/").map(segment));
    mkdirSync(dir, { recursive: true });
    const marker = join(dir, "_folder.json");
    if (existsSync(marker)) {
      const prev = JSON.parse(readFileSync(marker, "utf8"));
      if (prev.path !== folder.path) { console.error(`  CLASH: ${dir} already holds "${prev.path}", skipping "${folder.path}"`); report.push(`CLASH  ${folder.path}`); problems++; continue; }
    } else writeFileSync(marker, JSON.stringify({ path: folder.path, uidValidity, startedAt: new Date().toISOString() }, null, 2), { flag: "wx" });
    prepared.push({ folder, uidValidity, messages, dir, manifest: join(dir, "manifest.jsonl") });
    const todo = messages.filter((m) => { const f = join(dir, `${uidValidity}-${m.uid}.eml`); return !(existsSync(f) && statSync(f).size > 0); });
    alreadyHave += messages.length - todo.length; toGet += todo.length;
    let batch = [], size = 0;
    const flush = () => { if (batch.length) tasks.push({ folder, uidValidity, dir, manifest: join(dir, "manifest.jsonl"), msgs: batch }); batch = []; size = 0; };
    for (const m of todo) { batch.push(m); size += m.size || 0; if (batch.length >= 100 || size >= 25 * 1024 * 1024) flush(); }
    flush();
  }
  console.log(`Already saved from earlier runs: ${alreadyHave}. To download now: ${toGet} in ${tasks.length} batches, ${WORKERS} connections.`);

  let done = 0; const started = Date.now(); let lastPrint = 0;
  const progress = (force) => {
    if (!force && done - lastPrint < 500) return; lastPrint = done;
    const mins = (Date.now() - started) / 60000, rate = done / Math.max(mins, 0.01);
    const eta = rate > 0 ? Math.round((toGet - done) / rate) : "?";
    console.log(`  ${done}/${toGet} downloaded · ${Math.round(rate)}/min · about ${eta} min left`);
  };

  async function worker(first) {
    let c = first || await connect();
    for (;;) {
      const t = tasks.shift(); if (!t) break;
      const byUid = new Map(t.msgs.map((m) => [m.uid, m]));
      let remaining = new Set(t.msgs.map((m) => m.uid));
      for (let attempt = 1; attempt <= 3 && remaining.size; attempt++) {
        let lock;
        try {
          lock = await c.getMailboxLock(t.folder.path, { readOnly: true });
          for await (const msg of c.fetch([...remaining].join(","), { uid: true, source: true }, { uid: true })) {
            const m = byUid.get(msg.uid); if (!m || !remaining.has(msg.uid)) continue;
            const r = saveBuffer(t.dir, t.uidValidity, m, msg.source);
            if (r) {
              newFiles++; done++;
              appendFileSync(t.manifest, JSON.stringify({ uid: m.uid, uidValidity: t.uidValidity, size: m.size, bytes: r.bytes, sha256: r.sha256, internalDate: m.internalDate, flags: m.flags, file: `${t.uidValidity}-${m.uid}.eml` }) + "\n");
              if (r.sizeMismatch) warnings++;
            }
            remaining.delete(msg.uid);
          }
        } catch (e) {
          console.error(`  ${t.folder.path}: batch attempt ${attempt} failed: ${e.message}`);
          try { await c.logout(); } catch {}
          await sleep(2000 * attempt);
          try { c = await connect(); } catch (e2) { console.error(`  reconnect failed: ${e2.message}`); }
        } finally { try { lock?.release(); } catch {} }
      }
      if (remaining.size) { failedBy.set(t.folder.path, (failedBy.get(t.folder.path) || 0) + remaining.size); console.error(`  ${t.folder.path}: ${remaining.size} messages could not be saved`); }
      progress(false);
    }
    try { await c.logout(); } catch {}
  }
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i === 0 ? client : null)));
  progress(true);

  for (const { folder, uidValidity, messages, dir } of prepared) {
    const onDisk = readdirSync(dir).filter((n) => n.startsWith(uidValidity + "-") && n.endsWith(".eml")).length;
    const failed = failedBy.get(folder.path) || 0;
    const ok = failed === 0 && onDisk >= messages.length;
    if (!ok) problems++;
    const line = `${ok ? "OK  " : "FAIL"}  server ${messages.length}  on disk ${onDisk}  failed ${failed}  ${folder.path}`;
    console.log(line); report.push(line);
  }
  report.push("", `new files this run: ${newFiles}`, `size differences (informational): ${warnings}`, `folders with problems: ${problems}`);
  writeFileSync(join(DEST, "REPORT.txt"), report.join("\n") + "\n");
  console.log(`\n${problems === 0 ? "PASS" : "FAIL"} — ${newFiles} new files, ${warnings} size differences, ${problems} folders with problems. Report: ${join(DEST, "REPORT.txt")}`);
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
