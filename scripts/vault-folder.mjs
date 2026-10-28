#!/usr/bin/env node
// vault-folder.mjs — point at a folder of scans; everything else happens on this Mac (Ryan, 2026-10-28).
//
//   node scripts/vault-folder.mjs --folder "~/Desktop/Documents to file" --account <1Password account id>
//
// Reads every photo and PDF in the folder (never moved, copied or deleted), OCRs each one on this Mac (Apple Vision),
// works out what it is and whose, matches it to a row on Settings › 1Password, and opens a MAPPING SCREEN in the browser at a
// local address. Every field there can be changed: which row, which vault, the item's name, the date, a note, or skip.
// Nothing is written until Apply. Apply then, per row: creates the 1Password item with the scan attached (create only; this
// script has no delete or edit call), builds the private link, writes link and date into the app row, and puts a vehicle's
// registration or insurance date on the vehicle. Each result is read back before it is shown.
// Nothing leaves the Mac except the item's name, its link and its date, which go to the household's own database.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve, dirname, extname, basename } from "node:path";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : ""; };
const HOME = homedir();
const FOLDER = resolve(opt("--folder").replace(/^~/, HOME));
const ACCOUNT = opt("--account") || process.env.OP_ACCOUNT || "";
const SECRETS = join(HOME, "_secrets_local_only");
const OCR = resolve(dirname(new URL(import.meta.url).pathname), "ocr", "stewardos-ocr");
const PORT = 8788;
if (!FOLDER || !existsSync(FOLDER)) { console.error("STOP: say which folder: --folder \"~/Desktop/Documents to file\""); process.exit(1); }
if (!existsSync(OCR)) { console.error(`STOP: ${OCR} is not built. Run: swiftc -O -o scripts/ocr/stewardos-ocr scripts/ocr/stewardos-ocr.swift`); process.exit(1); }

const env = {};
try { for (const line of readFileSync(join(SECRETS, "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* below */ }
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error("STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY missing from ~/_secrets_local_only/family-dashboard.env"); process.exit(1); }
const sb = async (path, init = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", prefer: init.method === "PATCH" ? "return=representation" : "", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

// ---------- 1Password ----------
function op(argv, opts = {}) {
  if (ACCOUNT) argv = [...argv, "--account", ACCOUNT];
  const r = spawnSync("op", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 180_000, stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.status !== 0) throw new Error(`op ${argv.slice(0, 3).join(" ")}: ${(r.stderr || "").trim().slice(0, 300)}`);
  return r.stdout;
}
const opJson = (argv) => JSON.parse(op([...argv, "--format", "json"]));

// ---------- what a scan is ----------
// Kinds the template knows, with the words that give them away on the document itself. Order matters: the first match wins.
const KINDS = [
  ["passport", /\bPASSPORT\b|\bP<[A-Z]{3}/i],
  ["license", /DRIVER'?S? ?LICEN[SC]E|\bDL\b.*\bCLASS\b|OPERATOR LICENSE|IDENTIFICATION CARD.*\bDOB\b/i],
  ["ssn", /SOCIAL SECURITY/i],
  ["birth", /CERTIFICATE OF (LIVE )?BIRTH|BIRTH CERTIFICATE/i],
  ["marriage", /MARRIAGE (CERTIFICATE|LICENSE)|CERTIFICATE OF MARRIAGE/i],
  ["title", /CERTIFICATE OF TITLE|\bTITLE\b.*\bVIN\b/i],
  ["registration", /\bREGISTRATION\b.*(VEHICLE|EXPIR|VIN|PLATE)|VEHICLE REGISTRATION/i],
  ["auto_card", /INSURANCE (IDENTIFICATION|ID) CARD|PROOF OF (AUTO|VEHICLE) INSURANCE|AUTO(MOBILE)? INSURANCE/i],
  ["auto_policy", /DECLARATIONS? PAGE|POLICY DECLARATIONS|AUTO POLICY/i],
  ["home_insurance", /HOMEOWNERS?|DWELLING COVERAGE/i],
  ["dental_card", /\bDENTAL\b|\bVISION\b.*\b(PLAN|MEMBER)\b/i],
  ["health_card", /HEALTH INSURANCE|MEDICAL (CARD|PLAN|INSURANCE)|MEMBER (ID|NUMBER|#)|GROUP (NO|NUMBER|#)|RX ?BIN|HEALTH PLAN|COPAY|DEDUCTIBLE|SELECT ?HEALTH|BLUE CROSS|UNITED ?HEALTH|AETNA|CIGNA|HUMANA/i],
  ["vaccines", /IMMUNIZATION|VACCIN/i],
  ["life_insurance", /LIFE INSURANCE|TERM LIFE/i],
  ["ein", /EMPLOYER IDENTIFICATION NUMBER|\bEIN\b/i],
  ["formation", /ARTICLES OF (ORGANIZATION|INCORPORATION)|OPERATING AGREEMENT|CERTIFICATE OF ORGANIZATION/i],
  ["deed", /WARRANTY DEED|QUITCLAIM|\bDEED\b.*\b(GRANTOR|GRANTEE)\b/i],
  ["will", /LAST WILL|LIVING TRUST|REVOCABLE TRUST/i],
  ["poa", /POWER OF ATTORNEY/i],
  ["traveler", /KNOWN TRAVELER|GLOBAL ENTRY|TSA PRE/i],
];
const KIND_LABEL = { passport: "passport", license: "driver license", ssn: "Social Security card", birth: "birth certificate", marriage: "Marriage certificate", title: "title", registration: "registration", auto_card: "insurance card", auto_policy: "Auto insurance policy", home_insurance: "Homeowners policy", dental_card: "dental and vision cards", health_card: "health insurance card", vaccines: "immunization record", life_insurance: "life insurance policy", ein: "EIN letter", formation: "formation documents", deed: "Deed and closing documents", will: "will and trust", poa: "powers of attorney", traveler: "known traveler number" };
const PERSON_KINDS = new Set(["passport", "license", "ssn", "birth", "health_card", "dental_card", "vaccines", "life_insurance", "will", "poa", "traveler"]);
const VEHICLE_KINDS = new Set(["title", "registration", "auto_card"]);
const EXPIRES = new Set(["passport", "license", "traveler", "registration", "auto_card", "auto_policy", "home_insurance", "health_card", "dental_card", "life_insurance"]);
// Private for an adult's own identity and estate papers; shared for children's and the household's.
const PRIVATE_FOR_ADULT = new Set(["passport", "license", "ssn", "birth", "health_card", "dental_card", "vaccines", "life_insurance", "will", "poa", "traveler"]);

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function* datesIn(text) {
  const re = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b|\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b|\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g;
  let m;
  while ((m = re.exec(text))) {
    let y, mo, d;
    if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if (m[4]) { mo = +m[4]; d = +m[5]; y = +m[6]; if (y < 100) y += 2000; }
    else if (m[7]) { d = +m[7]; mo = MON[m[8].toLowerCase().slice(0, 4)] ?? MON[m[8].toLowerCase().slice(0, 3)]; y = +m[9]; }
    else { mo = MON[m[10].toLowerCase().slice(0, 4)] ?? MON[m[10].toLowerCase().slice(0, 3)]; d = +m[11]; y = +m[12]; }
    if (!mo || mo > 12 || !d || d > 31 || y < 1990 || y > 2060) continue;
    yield { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, raw: m[0] };
  }
}
function expiryIn(text) {
  const lines = text.split(/\r?\n/); const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\b(exp|expir|expires|expiration|valid (through|thru|until|to)|policy period|effective|renew|renewal|through|coverage|end date|good thru)\b/i.test(lines[i])) continue;
    for (const d of datesIn(`${lines[i]} ${lines[i + 1] ?? ""}`)) hits.push({ ...d, line: lines[i].trim().slice(0, 100), sure: true });
  }
  if (hits.length) return hits.sort((a, b) => b.iso.localeCompare(a.iso))[0];
  const all = [...datesIn(text)]; if (!all.length) return null;
  return { ...all.sort((a, b) => b.iso.localeCompare(a.iso))[0], line: "latest date on the document (no 'expires' wording)", sure: false };
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function ocr(file) {
  const r = spawnSync(OCR, [file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 });
  let j = null; try { j = JSON.parse(r.stdout || ""); } catch { return ""; }
  return (j?.pages ?? []).map((p) => p.text).join("\n");
}

async function main() {
  // Who and what the household has, so a scan can be matched to a person, a vehicle and a row.
  const [profiles, children, vehicles, rows] = await Promise.all([
    sb("profiles?select=id,display_name,role&role=neq.child"), sb("children?select=id,display_name&archived_at=is.null"),
    sb("vehicles?select=id,short,plate,year,make,model"), sb("vault_pointers?select=id,label,link,expires_on,template_key,person,attached_kind,attached_id&deleted_at=is.null&order=label"),
  ]);
  const people = [...profiles.map((p) => ({ kind: "a", id: p.id, name: p.display_name })), ...children.map((c) => ({ kind: "k", id: c.id, name: c.display_name }))];
  const accounts = JSON.parse(spawnSync("op", ["account", "list", "--format", "json"], { encoding: "utf8" }).stdout || "[]");
  if (accounts.length > 1 && !ACCOUNT) { console.error("STOP: more than one 1Password account on this Mac; add --account <id>:\n" + accounts.map((a) => `  ${a.user_uuid || a.account_uuid}  (${a.email} at ${a.url})`).join("\n")); process.exit(1); }
  const me = opJson(["whoami"]);
  const host = String(me.url || accounts[0]?.url || "my.1password.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const vaults = opJson(["vault", "list"]).map((v) => ({ id: v.id, name: v.name }));
  // Three levels (Ryan, 2026-10-28): Just me, Parents (the two adults), Everyone (the whole family), plus a child's own vault.
  const privateVault = vaults.find((v) => /^(private|personal)$/i.test(v.name)) ?? vaults[0];
  const parentsVault = vaults.find((v) => /parents|mom and dad|both of us|^shared$/i.test(v.name) && !/\//.test(v.name)) ?? vaults.find((v) => /shared/i.test(v.name)) ?? vaults[0];
  const everyoneVault = vaults.find((v) => /^(everyone|family|household|whole family)$/i.test(v.name)) ?? parentsVault;
  const childVault = (name) => vaults.find((v) => new RegExp(`^${name}\\b`, "i").test(v.name)) ?? parentsVault;
  const sharedVault = parentsVault; void everyoneVault;
  const existingTitles = new Set(opJson(["item", "list"]).map((i) => norm(i.title)));
  console.log(`Using 1Password account ${me.email} at ${host}; vaults: ${vaults.map((v) => v.name).join(", ")}.`);

  // Read the folder.
  // Every photo and PDF in the folder and its subfolders. A subfolder's name is a hint ("Melissa/passport.jpg" is Melissa's).
  const walk = (dir, depth = 0) => { const out = []; for (const f of readdirSync(dir)) { if (f.startsWith(".")) continue; const p = join(dir, f); const st = statSync(p); if (st.isDirectory() && depth < 4) out.push(...walk(p, depth + 1)); else if (st.isFile() && /\.(pdf|jpe?g|png|heic|tiff?)$/i.test(f)) out.push(p); } return out; };
  const files = walk(FOLDER).sort();
  if (!files.length) { console.error(`STOP: no photos or PDFs in ${FOLDER}`); process.exit(1); }
  console.log(`Reading ${files.length} file${files.length === 1 ? "" : "s"} in ${FOLDER} (on this Mac)…`);
  // Front and back of one card (or page 1 / page 2) are one document: files whose names differ only by (Front)/(Back),
  // front/back, or a trailing 1/2 are grouped, OCR'd together, and become ONE 1Password item with every file attached.
  const groupKey = (f) => f.slice(FOLDER.length + 1).replace(/\.[^.]+$/, "").replace(/\s*[(\[]?\s*(front|back|side ?[ab12]|page ?\d|p\d|\d)\s*[)\]]?\s*$/i, "").trim().toLowerCase();
  const groups = new Map(); for (const f of files) { const k = groupKey(f); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const items = [];
  for (const group of groups.values()) {
    const file = group[0];
    const text = group.map((g) => ocr(g)).join("\n"); const hay = `${group.map((g) => g.slice(FOLDER.length + 1)).join("\n")}\n${text}`;   // the path inside the folder counts as text
    const kind = (KINDS.find(([, re]) => re.test(hay)) ?? [""])[0];
    const named = people.filter((p) => new RegExp(`\\b${p.name}\\b`, "i").test(hay));
    const person = named[0] ?? null;
    const vehicle = vehicles.find((v) => (v.plate && new RegExp(v.plate.replace(/[^A-Z0-9]/gi, ""), "i").test(hay.replace(/[^A-Za-z0-9\n]/g, ""))) || new RegExp(`\\b${v.short}\\b`, "i").test(hay) || (v.model && new RegExp(`\\b${v.model}\\b`, "i").test(hay))) ?? null;
    const date = kind && EXPIRES.has(kind) ? expiryIn(text) : null;
    // The row this scan belongs to: by template key when the subject is known, else by the kind alone.
    // One card can cover several people (a family health card): every named person's row gets the same item and link.
    let rowIds = [];
    if (kind && PERSON_KINDS.has(kind) && named.length) rowIds = named.map((p) => rows.find((r) => r.template_key === `${kind}:${p.kind}:${p.id}`)?.id).filter(Boolean);
    else if (kind && VEHICLE_KINDS.has(kind) && vehicle) rowIds = [rows.find((r) => r.template_key === `${kind}:v:${vehicle.id}`)?.id].filter(Boolean);
    else if (kind) rowIds = [rows.find((r) => r.template_key === `${kind}:household` || r.template_key === `${kind}:head`)?.id].filter(Boolean);
    const row = rowIds.length ? rows.find((r) => r.id === rowIds[0]) : null;
    const subject = named.length > 1 ? "Family" : person ? person.name : vehicle ? vehicle.short : "";
    const title = named.length > 1 && kind ? `Family ${KIND_LABEL[kind]}` : row ? row.label : kind ? `${subject ? subject + " " : ""}${KIND_LABEL[kind]}` : basename(file, extname(file));
    const vault = kind && person && person.kind === "a" && PRIVATE_FOR_ADULT.has(kind) && named.length <= 1 ? privateVault : kind && person && person.kind === "k" && named.length <= 1 && PERSON_KINDS.has(kind) ? childVault(person.name) : sharedVault;
    const sure = !!(row && (!EXPIRES.has(kind) || (date && date.sure)));
    items.push({ i: items.length, file, files: group, name: group.map((g) => basename(g)).join(" + "), kind, person: person?.name ?? "", vehicle: vehicle?.short ?? "", rowIds, title, vaultId: vault?.id ?? "", date: date?.iso ?? "", dateFrom: date ? `${date.sure ? "" : "guess: "}${date.line}` : (kind && EXPIRES.has(kind) ? "no date read" : ""), alreadyLinked: !!row?.link, dup: existingTitles.has(norm(title)), sure, skip: !!row?.link || existingTitles.has(norm(title)), preview: text.replace(/\s+/g, " ").slice(0, 220) });
  }
  console.log(`Read ${items.length}: ${items.filter((x) => x.sure).length} mapped with confidence, ${items.filter((x) => !x.sure && x.kind).length} to check, ${items.filter((x) => !x.kind).length} unrecognised.`);

  // ---------- the mapping screen ----------
  const token = randomBytes(12).toString("hex");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rowOptions = (sel) => rows.map((r) => `<option value="${r.id}" ${sel.includes(r.id) ? "selected" : ""}>${esc(r.label)}${r.link ? " (already linked)" : ""}</option>`).join("");
  const vaultOptions = (sel) => vaults.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.name)}</option>`).join("");
  const page = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Map scans to 1Password</title>
<style>body{font:15px -apple-system,system-ui;margin:0;padding:20px;background:#f5f5f7;color:#111}h1{font-size:20px}.card{background:#fff;border-radius:14px;padding:14px;margin:12px 0;display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;box-shadow:0 1px 2px #0001}body{max-width:1100px;margin:0 auto}.card.check{outline:2px solid #e0a000}.card.skip{opacity:.5}img{width:150px;max-height:190px;object-fit:contain;border-radius:8px;background:#eee}.pdf{width:150px;height:120px;border-radius:8px;background:#eee;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px}label{display:block;font-size:12px;color:#555;margin-top:6px}input,select{width:100%;padding:8px;border:1px solid #ccc;border-radius:8px;font:inherit}.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:#eee;margin-right:6px}.tag.warn{background:#fff1c2}.tag.ok{background:#d9f5dd}.pre{font-size:11px;color:#777;margin-top:6px;max-height:40px;overflow:hidden}button{padding:12px 20px;border-radius:999px;border:0;background:#0F4C81;color:#fff;font:inherit;font-weight:600}.res{font-size:13px;margin-top:8px}.res.ok{color:#117733}.res.bad{color:#b00}</style></head><body>
<h1>Map ${items.length} scans</h1><p style="color:#555">Everything here runs on this Mac. Fix anything that is wrong, untick what should not go, then Apply. Apply creates the 1Password item with the scan attached, and fills the link and date on the list.</p>
<form id="f">${[...items].sort((a, b) => Number(a.sure) - Number(b.sure)).map((x) => `
<div class="card ${x.skip ? "skip" : x.sure ? "" : "check"}" id="c${x.i}">
  <div>${/\.pdf$/i.test(x.file) ? `<div class="pdf">PDF<br>${esc(basename(x.file))}</div>` : `<img src="/file/${x.i}?t=${token}" alt="">`}${(x.files?.length ?? 1) > 1 ? `<div style="font-size:11px;color:#777;margin-top:4px">${x.files.length} files, one item</div>` : ""}</div>
  <div>
    <div><label style="display:inline"><input type="checkbox" name="go${x.i}" ${x.skip ? "" : "checked"} style="width:auto"> include</label>
      <span class="tag ${x.sure ? "ok" : "warn"}">${x.sure ? "looks right" : x.kind ? "check this" : "what is this?"}</span>
      ${x.alreadyLinked ? `<span class="tag">row already linked</span>` : ""}${x.dup ? `<span class="tag warn">already in 1Password under this name (unticked so no copy is made; tick to make one anyway)</span>` : ""}
      <span style="font-size:12px;color:#777">${esc(x.name)}</span></div>
    <div style="font-size:12px;color:#555;margin-top:4px">Read: ${x.kind ? esc(KIND_LABEL[x.kind]) : "unknown kind"}${x.person ? ", " + esc(x.person) : ""}${x.vehicle ? ", " + esc(x.vehicle) : ""}${x.dateFrom ? " · " + esc(x.dateFrom) : ""}</div>
    <label>Which row(s) on the list — hold ⌘ to pick several when one card covers several people<select name="row${x.i}" multiple size="7">${rowOptions(x.rowIds)}</select></label>
    <div class="row2"><label>1Password item name<input name="title${x.i}" value="${esc(x.title)}"></label><label>Vault<select name="vault${x.i}">${vaultOptions(x.vaultId)}</select></label></div>
    <div class="row2"><label>Expires or renews<input type="date" name="date${x.i}" value="${esc(x.date)}"></label><label>Note<input name="note${x.i}" placeholder="Original in the safe"></label></div>
    <div class="pre">${esc(x.preview)}</div><div class="res" id="r${x.i}"></div>
  </div></div>`).join("")}
<p><button type="submit" id="go">Apply</button> <span id="status" style="margin-left:10px;color:#555"></span></p></form>
<script>
document.querySelectorAll('select[multiple]').forEach(sel=>{const o=sel.querySelector('option:checked');if(o)sel.scrollTop=o.offsetTop-sel.clientHeight/2});
const f=document.getElementById('f');f.onsubmit=async(e)=>{e.preventDefault();const d=new FormData(f);const rows=[];${JSON.stringify(items.map((x) => x.i))}.forEach(i=>{if(!d.get('go'+i))return;rows.push({i,rowIds:d.getAll('row'+i),title:d.get('title'+i),vaultId:d.get('vault'+i),date:d.get('date'+i),note:d.get('note'+i)})});
if(!rows.length){alert('Nothing ticked.');return}if(!confirm(rows.length+' scans: create the 1Password items and fill the list?'))return;document.getElementById('go').disabled=true;document.getElementById('status').textContent='Working…';
const r=await fetch('/apply?t=${token}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rows)});const out=await r.json();
for(const o of out){const el=document.getElementById('r'+o.i);el.className='res '+(o.ok?'ok':'bad');el.textContent=o.text}document.getElementById('status').textContent='Done: '+out.filter(o=>o.ok).length+' of '+out.length+' written. You can close this window; the Terminal has the same list.'};
</script></body></html>`;

  const server = createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.searchParams.get("t") !== token) { res.writeHead(403); res.end("no"); return; }
    if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(page()); return; }
    const mf = /^\/file\/(\d+)$/.exec(u.pathname);
    if (mf) { const x = items[+mf[1]]; if (!x) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": /\.png$/i.test(x.file) ? "image/png" : /\.heic$/i.test(x.file) ? "image/heic" : "image/jpeg" }); res.end(readFileSync(x.file)); return; }
    if (u.pathname === "/apply" && req.method === "POST") {
      let body = ""; for await (const c of req) body += c;
      const wanted = JSON.parse(body); const out = [];
      for (const w of wanted) {
        const x = items[w.i]; const r = { i: w.i, ok: false, text: "" };
        try {
          const targets = (w.rowIds || []).map((id) => rows.find((q) => q.id === id)).filter(Boolean);
          if (!targets.length) { r.text = "skipped: no row picked"; out.push(r); continue; }
          const row = targets[0];
          const title = String(w.title || row.label).trim().slice(0, 120);
          const created = JSON.parse(op(["document", "create", x.file, "--title", title, "--vault", w.vaultId, "--file-name", basename(x.file), "--tags", "StewardOS", "--format", "json"]));
          for (const extraFile of (x.files ?? []).slice(1)) { try { op(["item", "edit", created.id, "--vault", w.vaultId, `Attachments.${basename(extraFile).replace(/[^A-Za-z0-9]+/g, "_")}[file]=${extraFile}`]); } catch (e) { console.log(`  (could not attach ${basename(extraFile)}: ${String(e.message).slice(0, 120)})`); } }
          const link = `https://start.1password.com/open/i?a=${me.account_uuid}&v=${created.vault?.id ?? w.vaultId}&i=${created.id}&h=${host}`;
          const patch = { link, updated_at: new Date().toISOString() };
          if (/^\d{4}-\d{2}-\d{2}$/.test(w.date)) patch.expires_on = w.date;
          if (w.note) patch.note = String(w.note).slice(0, 300);
          const afters = [];
          for (const t of targets) { const [a] = await sb(`vault_pointers?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify(patch) }); if (!a?.link) throw new Error(`the app row "${t.label}" did not take the link`); afters.push(a); }
          const after = afters[0];
          let extra = "";
          const kind = String(after.template_key ?? "").split(":")[0];
          if (after.attached_kind === "vehicle" && patch.expires_on && (kind === "registration" || kind === "auto_card")) {
            const v = vehicles.find((q) => q.id === after.attached_id);
            if (v) { const cur = (await sb(`vehicles?id=eq.${v.id}&select=details`))[0]?.details ?? {}; const field = kind === "registration" ? "regExpiry" : "insuranceRenewal"; const [vv] = await sb(`vehicles?id=eq.${v.id}`, { method: "PATCH", body: JSON.stringify({ details: { ...cur, [field]: patch.expires_on }, updated_at: new Date().toISOString() }) }); if (vv?.details?.[field]) extra = `; ${v.short} ${field === "regExpiry" ? "registration expires" : "insurance renews"} ${vv.details[field]}`; }
          }
          r.ok = true; r.text = `1Password item "${title}" created in ${vaults.find((q) => q.id === w.vaultId)?.name ?? "vault"} with the scan; ${afters.length === 1 ? `list row "${after.label}" linked` : `${afters.length} list rows linked (${afters.map((a) => a.label).join(", ")})`}${after.expires_on ? `, date ${after.expires_on}` : ""}${extra}.`;
        } catch (e) { r.text = `not done: ${String(e.message).slice(0, 200)}`; }
        out.push(r); console.log(`${r.ok ? "OK " : "NOT"} ${x.name}: ${r.text}`);
      }
      mkdirSync(SECRETS, { recursive: true }); writeFileSync(join(SECRETS, `vault-folder-${Date.now()}.json`), JSON.stringify({ folder: FOLDER, at: new Date().toISOString(), out }, null, 2), { mode: 0o600 });
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)); return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${PORT}/?t=${token}`;
    console.log(`\nMapping screen: ${url}\n(opening it in your browser; this window stays open until you press Ctrl-C when you are done)`);
    spawnSync("open", [url]);
  });
}
main().catch((e) => { console.error(`STOP: ${e.message}`); process.exit(1); });
