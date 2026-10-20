#!/usr/bin/env node
// Mac mini → filing agent. Runs every 10 minutes via launchd. No model, no dependencies: Node 20+ and fetch.
//
// COPY-ONLY. For every Inbox item the household has filed (status 'resolved', filed set, file not yet copied):
//   1. download the stored file(s) from the private "captures" bucket,
//   2. write a copy under ~/Organized/<home folder chosen in the plan> using the proposed name,
//      never overwriting (a different file with the same name gets " (2)"),
//   3. read the copy back and verify size and SHA-256 against the stored fingerprint,
//   4. record copied_path / copied_at on the item (or copy_error, to be retried and shown on Health).
// Nothing is ever deleted: not in the app, not on the mini. The app keeps its copy (decision, Ryan 2026-10-20);
// the 8TB nightly mirror carries the mini's copy from there.
//
// Flags: --dry  prints what it would do and changes nothing.
// Secrets: ~/_secrets_local_only/family-dashboard.env (SUPABASE_URL, SUPABASE_SERVICE_KEY), same as the other agents.

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, extname, resolve, sep } from "node:path";

const DRY = process.argv.includes("--dry");
const BATCH = 25;
const ROOT = join(homedir(), "Organized");

const envPath = join(homedir(), "_secrets_local_only", "family-dashboard.env");
let env = {};
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* reported in main() */ }
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---------- pure helpers (exported for tests) ----------
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// One path segment, safe on any filesystem: no separators, no leading dots, no control characters.
export function safeSegment(s) {
  return String(s ?? "").replace(/[\u0000-\u001f\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").replace(/^[.\s]+/, "").trim().slice(0, 120);
}

// "Organized/Personal/Documents/Vehicles/Sienna/2026/" → absolute folder inside ROOT, or null when it would escape it.
export function destFolder(home, root = ROOT) {
  const parts = String(home ?? "").split("/").map(safeSegment).filter(Boolean);
  if (parts[0] === "Organized") parts.shift();
  if (!parts.length) return null;
  const abs = resolve(root, ...parts);
  return abs === root || abs.startsWith(root + sep) ? abs : null;
}

// Never overwrite: same name + same bytes = already there; same name + different bytes = " (2)", " (3)"…
export function pickName(dir, base, ext, hash, exists = existsSync, readHash = (p) => sha256(readFileSync(p))) {
  for (let n = 1; n < 100; n++) {
    const p = join(dir, `${base}${n === 1 ? "" : ` (${n})`}${ext}`);
    if (!exists(p)) return { path: p, existing: false };
    if (readHash(p) === hash) return { path: p, existing: true };
  }
  throw new Error("too many files with this name");
}

// ---------- work ----------
async function download(path) {
  const r = await fetch(`${URL}/storage/v1/object/captures/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`download ${path} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function copyItem(it, log) {
  const home = it.read_result?.home;
  const dir = destFolder(home);
  if (!dir) throw new Error(`no safe destination (home=${JSON.stringify(home)})`);
  const pages = Array.isArray(it.pages) && it.pages.length ? it.pages : [{ path: it.file_path, sha256: it.sha256, size: it.size_bytes }];
  const base = safeSegment(it.title) || "document";
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const buf = await download(pg.path);
    const hash = sha256(buf);
    if (pg.sha256 && hash !== pg.sha256) throw new Error(`downloaded bytes do not match the stored fingerprint for page ${i + 1}`);
    const name = pages.length > 1 ? `${base} p${i + 1}` : base;
    const ext = extname(pg.path) || "";
    if (DRY) { out.push(join(dir, name + ext) + " (dry run)"); continue; }
    mkdirSync(dir, { recursive: true });
    const { path, existing } = pickName(dir, name, ext, hash);
    if (!existing) writeFileSync(path, buf, { flag: "wx" });
    // verify the copy as it is on disk
    const back = readFileSync(path);
    if (back.length !== buf.length || sha256(back) !== hash || statSync(path).size !== buf.length) throw new Error(`verification failed for ${path}`);
    out.push(path);
  }
  return out;
}

async function main() {
  if (!URL || !KEY) { console.error(`SUPABASE_URL / SUPABASE_SERVICE_KEY not set (looked in ${envPath})`); process.exit(1); }
  if (!DRY && !existsSync(ROOT)) { console.error(`${ROOT} not found; is this the Mac mini?`); process.exit(1); }
  const items = await rest("GET", `inbox_items?status=eq.resolved&filed=not.is.null&copied_at=is.null&file_path=not.is.null&select=id,title,file_path,pages,sha256,size_bytes,read_result,copy_error&order=captured_at.asc&limit=${BATCH}`);
  const log = [];
  let ok = 0, failed = 0;
  for (const it of items) {
    try {
      const paths = await copyItem(it, log);
      if (!DRY) await rest("PATCH", `inbox_items?id=eq.${it.id}`, { copied_path: paths.join("\n"), copied_at: new Date().toISOString(), copy_error: null }, { Prefer: "return=minimal" });
      ok++; log.push(`${it.title}: ${DRY ? "would copy" : "copied"} → ${paths.join(", ")}`);
    } catch (e) {
      failed++; log.push(`${it.title}: ERROR ${e.message}`);
      if (!DRY) await rest("PATCH", `inbox_items?id=eq.${it.id}`, { copy_error: String(e.message).slice(0, 300) }, { Prefer: "return=minimal" }).catch(() => {});
    }
  }
  const summary = items.length ? `${ok} copied, ${failed} failed` : "nothing waiting";
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "sync_filing", state: failed ? "error" : "ok", summary: `Filing agent: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  for (const l of log) console.log(l);
  console.log(`${new Date().toISOString()} ${DRY ? "[dry] " : ""}${summary}`);
}

if (process.argv[1] && process.argv[1].endsWith("filing-agent.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
