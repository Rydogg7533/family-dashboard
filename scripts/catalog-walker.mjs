#!/usr/bin/env node
// catalog-walker.mjs — the document catalog (D98). Reads every document under ~/Organized once, keeps
// the text on the hub in one SQLite file, and tells the cloud only what each document IS (name, date,
// kind, subject, fingerprint) so Ask can find it from anywhere. Contents never leave the machine here.
//
//   --full            first pass: read everything not yet in the index (resumable; run under caffeinate)
//   --sweep           incremental: stat everything, read only new or changed files (launchd, every 10 min)
//   --status          counts and the last run
//   --max-minutes N   stop after N minutes (the sweep uses 8)
//
// Index: ~/Library/Application Support/StewardOS/catalog.sqlite — outside Organized on purpose, so it is
// never catalogued or filed. Rebuildable from the files. OCR: scripts/ocr/stewardos-ocr (Apple Vision,
// on device). Files are only ever read; nothing is written back, moved or deleted. A file that disappears
// is marked gone in the index, never removed from it.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, statSync, readdirSync, mkdirSync, existsSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, extname, basename, dirname, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const MODE = has("--full") ? "full" : has("--status") ? "status" : "sweep";
const MAX_MIN = Number(opt("--max-minutes", MODE === "sweep" ? 8 : 0)) || 0;
const started = Date.now();
const outOfTime = () => MAX_MIN > 0 && Date.now() - started > MAX_MIN * 60_000;

const HOME = homedir();
const ROOT = resolve(HOME, "Organized");
const DB_DIR = join(HOME, "Library", "Application Support", "StewardOS");
const DB = join(DB_DIR, "catalog.sqlite");
const OCR = resolve(dirname(new URL(import.meta.url).pathname), "ocr", "stewardos-ocr");
const SKIP_DIRS = new Set(["_Catalog", "node_modules", ".git", "_Consolidation Records"]);
const READ_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".heic", ".tif", ".tiff", ".txt", ".md", ".csv", ".eml", ".docx"]);
const NAME_ONLY_EXT = new Set([".mov", ".mp4", ".m4v", ".avi", ".mp3", ".m4a", ".wav", ".zip", ".dmg", ".pkg", ".psd", ".fig", ".cr2", ".dxf", ".ai", ".sketch", ".numbers", ".pages", ".key", ".xlsx", ".pptx", ".json", ".tsv", ".html", ".js", ".mjs", ".ts"]);
const MAX_BYTES = 50 * 1024 * 1024;

// ---------- secrets (cloud push is optional: without them the index still builds) ----------
const env = {};
try { for (const line of readFileSync(join(HOME, "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* no cloud push */ }
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- the index ----------
mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB);
db.exec(`
  pragma journal_mode = wal;
  create table if not exists documents (
    id integer primary key,
    path text not null unique,          -- relative to ~, starts with Organized/
    name text not null,
    ext text not null,
    size integer not null,
    mtime integer not null,             -- ms
    sha256 text,
    kind text,                          -- receipt | statement | bill | warranty | form | letter | photo | other
    doc_date text,                      -- YYYY-MM-DD when known
    subject text,                       -- Personal | Business/<entity> | Vehicles/<name> …
    pages integer not null default 0,
    read_at integer,                    -- ms; null = catalogued by name only, not read yet
    read_source text,                   -- pdf-text | vision | text | name-only | error
    confidence real,
    error text,
    gone_at integer,                    -- ms; the file was not found on a later sweep
    cloud_at integer                    -- ms; metadata pushed
  );
  create index if not exists documents_unread on documents (read_at) where read_at is null and gone_at is null;
  create table if not exists pages (
    doc_id integer not null references documents(id),
    n integer not null,
    text text not null,
    confidence real,
    primary key (doc_id, n)
  );
  create virtual table if not exists pages_fts using fts5(text, content='pages', content_rowid='rowid');
  create trigger if not exists pages_ai after insert on pages begin insert into pages_fts(rowid, text) values (new.rowid, new.text); end;
  create trigger if not exists pages_ad after delete on pages begin insert into pages_fts(pages_fts, rowid, text) values ('delete', old.rowid, old.text); end;
  create table if not exists runs (id integer primary key, mode text, started integer, finished integer, seen integer, read integer, errors integer, note text);
`);

const q = {
  get: db.prepare("select id, size, mtime, sha256, read_at, gone_at from documents where path = ?"),
  ins: db.prepare("insert into documents (path, name, ext, size, mtime, kind, subject, doc_date) values (?, ?, ?, ?, ?, ?, ?, ?) returning id"),
  touch: db.prepare("update documents set size = ?, mtime = ?, sha256 = null, read_at = null, read_source = null, pages = 0, error = null, gone_at = null, cloud_at = null where id = ?"),
  back: db.prepare("update documents set gone_at = null where id = ?"),
  gone: db.prepare("update documents set gone_at = ?, cloud_at = null where gone_at is null and id not in (select value from json_each(?))"),
  // Documents first (PDF, text, Word), newest first; images after. A policy gets read before a logo render.
  unread: db.prepare("select id, path, ext, size from documents where read_at is null and gone_at is null order by case when ext in ('.pdf', '.txt', '.md', '.csv', '.eml', '.docx') then 0 else 1 end, mtime desc"),
  setRead: db.prepare("update documents set sha256 = ?, read_at = ?, read_source = ?, pages = ?, confidence = ?, error = ?, doc_date = coalesce(?, doc_date), cloud_at = null where id = ?"),
  delPages: db.prepare("delete from pages where doc_id = ?"),
  insPage: db.prepare("insert into pages (doc_id, n, text, confidence) values (?, ?, ?, ?)"),
  toCloud: db.prepare("select id, path, name, ext, size, sha256, kind, doc_date, subject, pages, read_at, read_source, confidence, gone_at from documents where cloud_at is null limit 150"),
  cloudDone: db.prepare("update documents set cloud_at = ? where id in (select value from json_each(?))"),
  run: db.prepare("insert into runs (mode, started, finished, seen, read, errors, note) values (?, ?, ?, ?, ?, ?, ?)"),
};

// ---------- what a file is, from where it lives and what it is called ----------
function classify(rel) {
  const parts = rel.split("/");                       // Organized/Personal/Documents/Finance/2026/Receipts/x.pdf
  const low = rel.toLowerCase();
  const subject = parts[1] === "Business" ? `Business/${parts[2] ?? ""}` : /\/vehicles\/([^/]+)\//i.test(rel) ? `Vehicles/${rel.match(/\/vehicles\/([^/]+)\//i)[1]}` : parts[1] ?? "Other";
  const kind = /receipt/.test(low) ? "receipt" : /statement/.test(low) ? "statement" : /\/bills?\//.test(low) || /invoice/.test(low) ? "bill" : /warrant/.test(low) ? "warranty" : /\/(tax|taxes)\//.test(low) ? "tax" : /insurance|policy/.test(low) ? "insurance" : /\/records?\//.test(low) ? "record" : /\/(photos?|pictures)\//.test(low) ? "photo" : "other";
  const name = basename(rel);
  const d = name.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? rel.match(/\/((?:19|20)\d{2})-(\d{2})-(\d{2})[^/]*$/);
  const doc_date = d ? `${d[1]}-${d[2]}-${d[3]}` : (rel.match(/\/((?:19|20)\d{2})\//) ? `${rel.match(/\/((?:19|20)\d{2})\//)[1]}-01-01` : null);
  return { kind, subject, doc_date };
}

function* walk(dir) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

async function sha(path) {
  return new Promise((res, rej) => { const h = createHash("sha256"); createReadStream(path).on("data", (c) => h.update(c)).on("end", () => res(h.digest("hex"))).on("error", rej); });
}

// Stat everything; register new files; mark changed files unread; mark missing files gone.
function catalogue() {
  const seen = [];
  let added = 0, changed = 0;
  // node:sqlite has no transaction() helper (that is better-sqlite3); begin/commit by hand.
  db.exec("begin");
  try {
    for (const abs of walk(ROOT)) {
      const rel = relative(HOME, abs);
      const ext = extname(abs).toLowerCase();
      let st; try { st = statSync(abs); } catch { continue; }
      const row = q.get.get(rel);
      if (!row) {
        const c = classify(rel);
        const r = q.ins.get(rel, basename(abs), ext, st.size, Math.round(st.mtimeMs), c.kind, c.subject, c.doc_date);
        seen.push(r.id); added++;
      } else {
        seen.push(row.id);
        if (row.gone_at) q.back.run(row.id);
        if (row.size !== st.size || row.mtime !== Math.round(st.mtimeMs)) { q.touch.run(st.size, Math.round(st.mtimeMs), row.id); changed++; }
      }
    }
    q.gone.run(Date.now(), JSON.stringify(seen));
    db.exec("commit");
  } catch (e) { db.exec("rollback"); throw e; }
  return { seen: seen.length, added, changed };
}

function textOf(abs, ext) {
  if ([".txt", ".md", ".csv", ".eml"].includes(ext)) return { pages: [{ n: 1, text: readFileSync(abs, "utf8").slice(0, 200_000), confidence: 1 }], source: "text" };
  if (ext === ".docx") {
    const r = spawnSync("unzip", ["-p", abs, "word/document.xml"], { maxBuffer: 50 * 1024 * 1024 });
    const xml = r.stdout?.toString("utf8") ?? "";
    return { pages: [{ n: 1, text: xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").slice(0, 200_000), confidence: 1 }], source: "text" };
  }
  const r = spawnSync(OCR, [abs], { maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000 });
  const out = r.stdout?.toString("utf8") ?? "";
  let j; try { j = JSON.parse(out); } catch { throw new Error(`ocr: ${(r.stderr?.toString("utf8") ?? "").slice(0, 200) || "no output"}`); }
  if (j.error) throw new Error(`ocr: ${j.error}`);
  const sources = new Set(j.pages.map((p) => p.source));
  return { pages: j.pages, source: sources.size === 1 ? [...sources][0] : "mixed" };
}

// The date the document says, when the file name did not: the first full date on the first page.
// A real calendar date or null. Text like "2014-16-20" (a serial, not a date) must never reach the cloud:
// Postgres rejects the whole batch with a 400 and nothing new gets pushed until it is fixed.
function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}
function dateFromText(t) {
  const m = t.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/) || t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|19\d{2})\b/);
  if (!m) return null;
  if (m[0].includes("/")) return validDate(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  return validDate(`${m[1]}-${m[2]}-${m[3]}`);
}

async function readPending(limit) {
  let read = 0, errors = 0;
  for (const row of q.unread.all()) {
    if (outOfTime() || (limit && read + errors >= limit)) break;
    const abs = join(HOME, row.path);
    const ext = row.ext;
    try {
      if (!READ_EXT.has(ext)) { q.setRead.run(null, Date.now(), "name-only", 0, null, null, null, row.id); continue; }
      if (row.size > MAX_BYTES) { q.setRead.run(null, Date.now(), "error", 0, null, "over 50 MB", null, row.id); errors++; continue; }
      const digest = await sha(abs);
      const { pages, source } = textOf(abs, ext);
      const conf = pages.length ? pages.reduce((s, p) => s + (p.confidence ?? 0), 0) / pages.length : 0;
      db.exec("begin");
      try {
        q.delPages.run(row.id);
        for (const p of pages) q.insPage.run(row.id, p.n, p.text ?? "", p.confidence ?? null);
        q.setRead.run(digest, Date.now(), source, pages.length, conf, null, pages[0]?.text ? dateFromText(pages[0].text) : null, row.id);
        db.exec("commit");
      } catch (e) { db.exec("rollback"); throw e; }
      read++;
      if (read % 25 === 0) console.log(`${new Date().toISOString()} read ${read} (${row.path})`);
      if (read % 500 === 0) { try { await pushCloud(); } catch { /* next time */ } }
    } catch (e) {
      q.setRead.run(null, Date.now(), "error", 0, null, String(e.message ?? e).slice(0, 200), null, row.id);
      errors++;
    }
  }
  return { read, errors };
}

// Metadata only: what a document is and where it lives. Never its text.
async function pushCloud() {
  if (!SB_URL || !SB_KEY) return 0;
  let total = 0;
  for (;;) {
    const rows = q.toCloud.all();
    if (!rows.length) break;
    const body = rows.map((r) => ({ hub_id: r.id, path: r.path, name: r.name, ext: r.ext, size: r.size, sha256: r.sha256, kind: r.kind, doc_date: validDate(r.doc_date), subject: r.subject, pages: r.pages, read_at: r.read_at ? new Date(r.read_at).toISOString() : null, read_source: r.read_source, confidence: r.confidence, gone_at: r.gone_at ? new Date(r.gone_at).toISOString() : null }));
    // The push is best-effort: a dropped connection is retried once, then left for the next run. The
    // index on the hub is the truth; the cloud copy of the metadata only ever catches up.
    let res = null;
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      try { res = await fetch(`${SB_URL}/rest/v1/documents?on_conflict=hub_id`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }); }
      catch (e) { console.error(`cloud push attempt ${attempt + 1}: ${String(e.cause?.message ?? e.message ?? e).slice(0, 120)}`); await new Promise((r) => setTimeout(r, 2000)); }
    }
    if (!res) break;
    if (!res.ok) { console.error(`cloud push → ${res.status} ${(await res.text()).slice(0, 200)}`); break; }
    q.cloudDone.run(Date.now(), JSON.stringify(rows.map((r) => r.id)));
    total += rows.length;
  }
  return total;
}

if (MODE === "status") {
  const c = db.prepare("select count(*) n, sum(read_at is not null) read, sum(read_source='error') errors, sum(gone_at is not null) gone, sum(cloud_at is null) unpushed from documents").get();
  const last = db.prepare("select * from runs order by id desc limit 1").get();
  console.log(JSON.stringify({ db: DB, ...c, last }, null, 2));
  process.exit(0);
}

if (!existsSync(OCR)) { console.error(`STOP: ${OCR} is not built. Run: swiftc -O -o scripts/ocr/stewardos-ocr scripts/ocr/stewardos-ocr.swift`); process.exit(2); }
const t0 = Date.now();
const cat = catalogue();
console.log(`${new Date().toISOString()} catalogued ${cat.seen} files: ${cat.added} new, ${cat.changed} changed`);
const r = await readPending(MODE === "sweep" ? 200 : 0);
let pushed = 0;
try { pushed = await pushCloud(); } catch (e) { console.error(`cloud push failed: ${String(e.message ?? e).slice(0, 200)}`); }
q.run.run(MODE, t0, Date.now(), cat.seen, r.read, r.errors, `added ${cat.added}, changed ${cat.changed}, pushed ${pushed}`);
const left = db.prepare("select count(*) n from documents where read_at is null and gone_at is null").get().n;
console.log(`${new Date().toISOString()} ${MODE}: read ${r.read}, ${r.errors} errors, ${pushed} pushed to cloud, ${left} still to read, ${Math.round((Date.now() - t0) / 1000)}s`);
