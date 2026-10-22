#!/usr/bin/env node
// Gmail → local backup (copy-only). Run by hand on the Mac mini BEFORE any cleanup. No dependencies: Node 20+.
//
//   node scripts/gmail-backup.mjs --account admin@shvr.co --dest "/Volumes/<drive>/Mail Backup" --dry
//   node scripts/gmail-backup.mjs --account admin@shvr.co --dest "/Volumes/<drive>/Mail Backup"
//
// Saves EVERY message in the account (inbox, archive, sent, drafts, spam and trash included) as a raw .eml file,
// one file per message, plus manifest.jsonl (Gmail id, thread id, label ids, date, size, SHA-256) and labels.json
// (label id → name) so the folder structure can be rebuilt later.
//
// Safety rules:
//   - READ-ONLY on Gmail: the session is opened with allowWrite:false (scripts/email-lib.mjs), so any non-GET call throws.
//   - NEVER overwrites a backup file (created with link(), which fails if the name exists) and re-runs skip what is
//     already saved, so it is resumable. Only its own *.part temp files are replaced.
//   - The destination's parent folder must already exist (an unmounted drive never creates a stray folder on the Mac
//     mini's own disk) and the drive must have at least 3 GB free.
//   - Nothing is sent anywhere except Google's own API. Tokens are read from ~/_secrets_local_only/email-agent/.
//
// Layout: <dest>/gmail-<account>/<gmail id>.eml, manifest.jsonl, labels.json, REPORT.txt

import { existsSync, mkdirSync, statSync, statfsSync, writeFileSync, linkSync, unlinkSync, appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { die, option, openGmail } from "./email-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const DEST_PARENT = option(args, "--dest");
const WORKERS = Math.min(8, Math.max(1, parseInt(option(args, "--workers") || "5", 10) || 5));
const { account, api } = openGmail(args, { allowWrite: false });
if (!DEST_PARENT) die('pass --dest "<existing folder>" (e.g. a folder on the 8TB drive)');
if (!existsSync(DEST_PARENT) || !statSync(DEST_PARENT).isDirectory()) die(`${DEST_PARENT} does not exist (is the drive mounted?). Nothing was created.`);
const DEST = join(DEST_PARENT, `gmail-${account}`);

async function main() {
  console.log(`${DRY ? "DRY RUN (nothing downloaded)" : "BACKUP"} — ${account}`);
  const profile = await api("/gmail/v1/users/me/profile");
  if (String(profile.emailAddress).toLowerCase() !== account) die(`the saved sign-in belongs to ${profile.emailAddress}, not ${account}`);

  // every message id, including spam and trash
  const ids = []; let page = "";
  do {
    const r = await api(`/gmail/v1/users/me/messages?includeSpamTrash=true&maxResults=500${page ? `&pageToken=${page}` : ""}`);
    for (const m of r.messages || []) ids.push(m.id);
    page = r.nextPageToken || "";
    if (ids.length % 5000 < 500 && ids.length >= 5000) console.log(`  listed ${ids.length}…`);
  } while (page);
  console.log(`${ids.length} messages in the account (Gmail reports ${profile.messagesTotal} excluding spam/trash).`);

  const free = (() => { const s = statfsSync(DEST_PARENT); return s.bavail * s.bsize; })();
  console.log(`Free space at destination: ${(free / 1024 ** 3).toFixed(1)} GB`);
  if (free < 3 * 1024 ** 3) die("less than 3 GB free at the destination. Nothing was downloaded.");
  if (DRY) { console.log("Dry run finished. Re-run without --dry to copy."); return; }

  if (!existsSync(DEST)) mkdirSync(DEST);   // leaf only; the parent must exist
  const labels = await api("/gmail/v1/users/me/labels");
  const labelsFile = join(DEST, "labels.json");
  if (!existsSync(labelsFile)) writeFileSync(labelsFile, JSON.stringify(labels.labels || [], null, 2), { flag: "wx" });

  const have = new Set(readdirSync(DEST).filter((n) => n.endsWith(".eml")).map((n) => n.slice(0, -4)));
  const todo = ids.filter((id) => !have.has(id));
  console.log(`Already saved from earlier runs: ${ids.length - todo.length}. To download now: ${todo.length}, with ${WORKERS} connections.`);

  const manifest = join(DEST, "manifest.jsonl");
  let next = 0, done = 0, failed = 0, newBytes = 0; const started = Date.now();
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    for (;;) {
      const i = next++; if (i >= todo.length) return;
      const id = todo[i];
      try {
        const m = await api(`/gmail/v1/users/me/messages/${id}?format=raw`);
        const buf = Buffer.from(m.raw || "", "base64url");
        if (!buf.length) throw new Error("empty message");
        const final = join(DEST, `${id}.eml`), part = final + ".part";
        writeFileSync(part, buf);
        linkSync(part, final);                 // fails with EEXIST rather than overwrite
        unlinkSync(part);
        appendFileSync(manifest, JSON.stringify({ id, threadId: m.threadId, labelIds: m.labelIds || [], internalDate: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null, sizeEstimate: m.sizeEstimate, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") }) + "\n");
        newBytes += buf.length; done++;
      } catch (e) { failed++; console.error(`  ${id}: ${e.message}`); }
      if ((done + failed) % 500 === 0) {
        const mins = (Date.now() - started) / 60000, rate = (done + failed) / Math.max(mins, 0.01);
        console.log(`  ${done + failed}/${todo.length} · ${Math.round(rate)}/min · about ${Math.round((todo.length - done - failed) / rate)} min left`);
      }
    }
  }));

  const onDisk = readdirSync(DEST).filter((n) => n.endsWith(".eml")).length;
  const ok = failed === 0 && onDisk >= ids.length;
  const line = `${ok ? "PASS" : "FAIL"} — account ${account}: ${ids.length} messages in Gmail, ${onDisk} files on disk, ${done} new this run (${(newBytes / 1024 ** 2).toFixed(0)} MB), ${failed} failed.`;
  writeFileSync(join(DEST, "REPORT.txt"), `${new Date().toISOString()}\n${line}\n`);
  console.log(`\n${line}\nReport: ${join(DEST, "REPORT.txt")}${ok ? "" : "\nRe-run the same command to retry the failures."}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
