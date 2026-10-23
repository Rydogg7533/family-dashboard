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

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, extname, resolve, sep, relative } from "node:path";

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


// ---------- receipts: one file, filed by card and month (D69, Ryan 2026-10-23) ----------
export const HOLD_DAYS = 14;
const ym = (iso) => String(iso ?? "").slice(0, 7);

// Where a receipt's single file goes, or null while it waits for its card.
export function receiptHome(rc, now = Date.now()) {
  const when = rc.date || String(rc.created_at ?? "").slice(0, 10);
  const year = String(when).slice(0, 4), month = ym(when);
  if (!/^\d{4}$/.test(year) || !/^\d{4}-\d{2}$/.test(month)) return null;
  const card = safeSegment(rc.card);
  if (!card) {
    const age = (now - new Date(rc.created_at ?? now).getTime()) / 86400_000;
    if (age < HOLD_DAYS) return null; // still waiting for the card
    return `Organized/Personal/Documents/Finance/${year}/Unplaced/${month}/`;
  }
  return `Organized/Personal/Documents/Finance/${year}/${card}/${month}/`;
}

// "2026-10-20 AAA Toyota Sienna battery replacement $242.88" : the vehicle and the amount in the name, so a search finds it anywhere.
export function receiptFileName(title, amount, vehicleShort) {
  let n = safeSegment(title) || "receipt";
  if (vehicleShort && !n.toLowerCase().includes(String(vehicleShort).toLowerCase())) n += ` ${vehicleShort}`;
  if (typeof amount === "number" && amount > 0 && !n.includes("$")) n += ` $${amount.toFixed(2)}`;
  return safeSegment(n);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : "");

// One page per vehicle listing everything filed for it. Entries are generic (type + title + date + amount + where), so a part,
// a claim, a warranty paper or anything else that belongs to the vehicle just becomes another line.
export function vehicleIndexHtml(vehicleName, dir, entries) {
  const sorted = entries.slice().sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const rows = sorted.map((e) => {
    const link = e.file ? `<a href="${esc(relative(dir, e.file).split(sep).map(encodeURIComponent).join("/"))}">${esc(e.title)}</a>` : `${esc(e.title)} <span class="m">(${esc(e.note || "not filed yet")})</span>`;
    return `<tr><td>${esc(e.date ?? "")}</td><td><span class="t">${esc(e.type)}</span></td><td>${link}</td><td class="r">${esc(money(e.amount))}</td><td>${esc(e.card ?? "")}</td></tr>`;
  }).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>${esc(vehicleName)} index</title>
<style>body{font:15px -apple-system,system-ui,sans-serif;margin:32px auto;max-width:900px;padding:0 16px;color:#1b1b1f}h1{font-size:22px}table{border-collapse:collapse;width:100%}td,th{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{font-size:12px;color:#666;text-transform:uppercase}.r{text-align:right;white-space:nowrap}.t{font-size:12px;background:#eef;border-radius:6px;padding:1px 7px}.m{color:#888;font-size:13px}a{color:#0a58ca;text-decoration:none}</style>
<h1>${esc(vehicleName)}: everything filed for it</h1>
<p class="m">Generated by the StewardOS filing agent; rewritten on each run. Each line opens the one real file. ${sorted.length} item${sorted.length === 1 ? "" : "s"}.</p>
<table><tr><th>Date</th><th>Type</th><th>Document</th><th class="r">Amount</th><th>Card</th></tr>
${rows}
</table>`;
}

// ---------- work ----------
async function download(path) {
  const r = await fetch(`${URL}/storage/v1/object/captures/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`download ${path} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function copyItem(it, log, over = {}) {
  const home = over.home ?? it.read_result?.home;
  const dir = destFolder(home);
  if (!dir) throw new Error(`no safe destination (home=${JSON.stringify(home)})`);
  const pages = Array.isArray(it.pages) && it.pages.length ? it.pages : [{ path: it.file_path, sha256: it.sha256, size: it.size_bytes }];
  const base = over.base ?? (safeSegment(it.title) || "document");
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


// One index page per subject (a vehicle, the house, an appliance, a person, a trip, a business, a claim set...), plus a master list.
// Vehicles' indexes sit in the vehicle's own folder; every other subject's under Documents/Indexes/<Kind>/. These generated pages are the only
// files this agent rewrites; they are not yours. A subject of any kind appears the first time a receipt is tagged to it.
const KIND_DIR = { vehicle: "Vehicles", home: "Home", appliance: "Appliances", person: "People", pet: "Pets", business: "Businesses", trip: "Trips and events", project: "Projects", gift: "Gifts", other: "Other", claim: "Claims" };
export function indexKey(kind, name) { return `${kind}:${String(name).toLowerCase()}`; }
export function indexLocation(kind, name) {
  if (kind === "vehicle") return { folder: `Organized/Personal/Documents/Vehicles/${name}/`, file: `${safeSegment(name)} - index.html` };
  return { folder: `Organized/Personal/Documents/Indexes/${KIND_DIR[kind] ?? safeSegment(kind) ?? "Other"}/`, file: `${safeSegment(name)} - index.html` };
}

async function writeIndexes(vehicles, log) {
  const maps = new Map(); // key -> { kind, name, entries[] }
  const bucket = (kind, name) => { const k = indexKey(kind, name); if (!maps.has(k)) maps.set(k, { kind, name, entries: [] }); return maps.get(k); };
  const seen = new Set(); // key + file id, so the same receipt is listed once per subject
  const add = (b, id, e) => { const k = `${indexKey(b.kind, b.name)}|${id}`; if (seen.has(k)) return; seen.add(k); b.entries.push(e); };

  // receipts and the inbox items behind them (for the real file path and the readable name)
  const rcAll = await rest("GET", "receipts?select=id,merchant,amount,date,card,entity,home_path&order=date.desc&limit=1000");
  const inboxAll = await rest("GET", "inbox_items?status=eq.resolved&filed=not.is.null&select=id,title,read_result,filed,copied_path,captured_at&order=captured_at.desc&limit=1000");
  const inboxByReceipt = new Map(inboxAll.filter((f) => f.filed?.receipt_id).map((f) => [f.filed.receipt_id, f]));
  const rcById = new Map(rcAll.map((r) => [r.id, r]));
  const fileOf = (rc, inbox) => rc?.home_path || (inbox?.copied_path ? String(inbox.copied_path).split("\n")[0] : null);
  const receiptEntry = (rc) => { const inbox = inboxByReceipt.get(rc.id); return { date: rc.date, type: "receipt", title: inbox?.title || rc.merchant, amount: Number(rc.amount), card: rc.card ?? null, file: fileOf(rc, inbox), note: rc.card ? "copy pending" : "waiting for its card" }; };

  // (1) vehicles, from what the app read on each filed document (any filed item with a vehicle, receipt or not)
  const shortOf = new Map(vehicles.map((v) => [v.id, v.short]));
  for (const f of inboxAll.filter((f) => f.filed?.vehicle_id && shortOf.has(f.filed.vehicle_id))) {
    const b = bucket("vehicle", shortOf.get(f.filed.vehicle_id)); const rc = rcById.get(f.filed.receipt_id);
    add(b, f.filed.receipt_id || f.id, { date: f.read_result?.date || String(f.captured_at).slice(0, 10), type: rc ? "receipt" : (f.read_result?.kind || (f.read_result?.warranty_relevant ? "warranty paper" : "document")), title: f.title, amount: rc ? Number(rc.amount) : (typeof f.read_result?.amount === "number" ? f.read_result.amount : null), card: rc?.card ?? null, file: fileOf(rc, f) , note: rc && !rc.card ? "waiting for its card" : "copy pending" });
  }
  // (2) subjects the household tagged (any kind)
  const links = await rest("GET", "receipt_subjects?removed_at=is.null&select=receipt_id,subjects(kind,name)&limit=2000");
  for (const l of links) { const rc = rcById.get(l.receipt_id); if (!rc || !l.subjects) continue; add(bucket(l.subjects.kind, l.subjects.name), rc.id, receiptEntry(rc)); }
  // (3) businesses, from the entity a receipt was classified to (personal spending needs no index)
  for (const rc of rcAll) if (rc.entity && !/^(personal|)$/i.test(rc.entity)) add(bucket("business", rc.entity), rc.id, receiptEntry(rc));
  // (4) claims: one index of every claim with its documents; a claim tied to a vehicle is also listed there
  const claims = await rest("GET", "claims?select=id,title,status,expected_amount,created_at,vehicle_id,documents&order=created_at.desc&limit=300").catch(() => []);
  const inboxById = new Map(inboxAll.map((f) => [f.id, f]));
  for (const c of claims) {
    const cb = bucket("claim", "All claims");
    add(cb, `claim-${c.id}`, { date: String(c.created_at).slice(0, 10), type: `claim (${c.status})`, title: c.title, amount: c.expected_amount != null ? Number(c.expected_amount) : null, card: null, file: null, note: "see Claims in the app" });
    for (const d of c.documents ?? []) { const f = d.inbox_id ? inboxById.get(d.inbox_id) : null; add(cb, `claimdoc-${c.id}-${d.inbox_id ?? d.name}`, { date: f?.read_result?.date || String(c.created_at).slice(0, 10), type: `claim document: ${d.role ?? ""}`, title: d.name ?? f?.title ?? "document", amount: null, card: null, file: f?.copied_path ? String(f.copied_path).split("\n")[0] : null, note: "not filed yet" }); }
    if (c.vehicle_id && shortOf.has(c.vehicle_id)) add(bucket("vehicle", shortOf.get(c.vehicle_id)), `claim-${c.id}`, { date: String(c.created_at).slice(0, 10), type: `claim (${c.status})`, title: c.title, amount: c.expected_amount != null ? Number(c.expected_amount) : null, card: null, file: null, note: "see Claims in the app" });
  }

  const master = [];
  for (const b of maps.values()) {
    if (!b.entries.length) continue;
    const loc = indexLocation(b.kind, b.name);
    const dir = destFolder(loc.folder);
    if (!dir) continue;
    const out = join(dir, loc.file);
    master.push({ kind: b.kind, name: b.name, count: b.entries.length, out });
    if (DRY) { log.push(`index: would write ${out} (${b.entries.length} items)`); continue; }
    mkdirSync(dir, { recursive: true });
    const tmp = out + ".tmp";
    writeFileSync(tmp, vehicleIndexHtml(b.name, dir, b.entries));
    renameSync(tmp, out);
    log.push(`index: ${out} (${b.entries.length} items)`);
  }
  if (master.length && !DRY) {
    const dir = destFolder("Organized/Personal/Documents/Indexes/");
    if (dir) {
      mkdirSync(dir, { recursive: true });
      const rows = master.sort((x, y) => x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name)).map((m) => `<tr><td>${esc(m.kind)}</td><td><a href="${esc(relative(dir, m.out).split(sep).map(encodeURIComponent).join("/"))}">${esc(m.name)}</a></td><td class="r">${m.count}</td></tr>`).join("\n");
      const html = `<!doctype html><meta charset="utf-8"><title>All indexes</title><style>body{font:15px -apple-system,system-ui,sans-serif;margin:32px auto;max-width:700px;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}a{color:#0a58ca;text-decoration:none}</style><h1>Everything with an index</h1><p>One page for each vehicle, home item, person, trip, business and claim set that has filed paperwork. Generated by the filing agent.</p><table><tr><th>Kind</th><th>Subject</th><th class="r">Items</th></tr>${rows}</table>`;
      const out = join(dir, "All indexes.html"); const tmp = out + ".tmp"; writeFileSync(tmp, html); renameSync(tmp, out);
    }
  }
}

async function main() {
  if (!URL || !KEY) { console.error(`SUPABASE_URL / SUPABASE_SERVICE_KEY not set (looked in ${envPath})`); process.exit(1); }
  if (!DRY && !existsSync(ROOT)) { console.error(`${ROOT} not found; is this the Mac mini?`); process.exit(1); }
  const items = await rest("GET", `inbox_items?status=eq.resolved&filed=not.is.null&copied_at=is.null&file_path=not.is.null&select=id,title,file_path,pages,sha256,size_bytes,read_result,copy_error,filed&order=captured_at.asc&limit=${BATCH}`);
  const vehicles = await rest("GET", "vehicles?select=id,short,name").catch(() => []);
  const vshort = new Map((vehicles ?? []).map((v) => [v.id, v.short]));
  const log = [];
  let ok = 0, failed = 0, waiting = 0;
  for (const it of items) {
    try {
      let over = {}, rc = null;
      if (it.filed?.receipt_id) {
        const rows = await rest("GET", `receipts?id=eq.${it.filed.receipt_id}&select=id,merchant,amount,date,card,created_at`);
        rc = rows?.[0] ?? null;
        if (rc) {
          const home = receiptHome(rc);
          if (!home) { waiting++; log.push(`${it.title}: waiting for its card (held up to ${HOLD_DAYS} days)`); continue; }
          over = { home, base: receiptFileName(it.title, Number(rc.amount), vshort.get(it.filed.vehicle_id)) };
        }
      }
      const paths = await copyItem(it, log, over);
      if (!DRY) {
        await rest("PATCH", `inbox_items?id=eq.${it.id}`, { copied_path: paths.join("\n"), copied_at: new Date().toISOString(), copy_error: null }, { Prefer: "return=minimal" });
        if (rc) await rest("PATCH", `receipts?id=eq.${rc.id}`, { home_path: paths[0] }, { Prefer: "return=minimal" });
      }
      ok++; log.push(`${it.title}: ${DRY ? "would copy" : "copied"} → ${paths.join(", ")}`);
    } catch (e) {
      failed++; log.push(`${it.title}: ERROR ${e.message}`);
      if (!DRY) await rest("PATCH", `inbox_items?id=eq.${it.id}`, { copy_error: String(e.message).slice(0, 300) }, { Prefer: "return=minimal" }).catch(() => {});
    }
  }
  try { await writeIndexes(vehicles ?? [], log); } catch (e) { log.push(`vehicle index: ${e.message}`); }
  const summary = items.length ? `${ok} copied, ${failed} failed${waiting ? `, ${waiting} waiting for a card` : ""}` : "nothing waiting";
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "sync_filing", state: failed ? "error" : "ok", summary: `Filing agent: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  for (const l of log) console.log(l);
  console.log(`${new Date().toISOString()} ${DRY ? "[dry] " : ""}${summary}`);
}

if (process.argv[1] && process.argv[1].endsWith("filing-agent.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
