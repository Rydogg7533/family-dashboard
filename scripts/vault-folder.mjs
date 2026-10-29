#!/usr/bin/env node
// vault-folder.mjs — point at a folder of scans; everything else happens on this Mac (Ryan, 2026-10-28).
//
//   node scripts/vault-folder.mjs --folder "~/Desktop/Documents to file" --account <1Password account id>
//   node scripts/vault-folder.mjs --serve --account <id>     # take the folder, and the go-ahead, from the app:
//       Settings > 1Password > Map your documents. Keeps running; reads a folder whenever the app asks, sends what it
//       found back to be checked there, and creates the items when the person taps Add. Nothing is created until then.
//
// Reads every photo and PDF in the folder (never moved, copied or deleted), OCRs each one on this Mac (Apple Vision),
// works out what it is and whose, matches it to a row on Settings › 1Password, and opens a MAPPING SCREEN in the browser at a
// local address. Every field there can be changed: which row, which vault, the item's name, the date, a note, or skip.
// Nothing is written until Apply. Apply then, per row: creates the 1Password item with the scan attached (create only; this
// script has no delete or edit call), builds the private link, writes link and date into the app row, and puts a vehicle's
// registration or insurance date on the vehicle. Each result is read back before it is shown.
// Nothing leaves the Mac except the item's name, its link and its date, which go to the household's own database.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve, dirname, extname, basename } from "node:path";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : ""; };
const HOME = homedir();
let FOLDER = resolve(opt("--folder").replace(/^~/, HOME));
const SERVE = args.includes("--serve");   // take the folder, and the go-ahead, from the app instead of a localhost page
// The one folder a customer ever has to know about (Ryan, 2026-10-29: "shouldn't the folder path be a picker?" -- a web
// page cannot browse a folder on this Mac, so instead there is no choice to make). The server creates it, watches it, and
// tells the app what it sees there, so the screen can say "14 files, last added 2 minutes ago" before anyone taps.
const IMPORT_DIR = join(HOME, "StewardOS", "Import");
const DEFAULT_FOLDER = "~/StewardOS/Import";
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
  const text = await r.text();
  return text ? JSON.parse(text) : null;      // a return=minimal write answers with nothing, which is not an error
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
  if (!files.length) { if (SERVE) throw new Error(`no photos or PDFs in ${FOLDER}`); console.error(`STOP: no photos or PDFs in ${FOLDER}`); process.exit(1); }
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

  // ---------- serving the app (decisions 2026-10-29) ----------
  // The same reading, the same creating; the screen is just somewhere else. What goes back is only what the
  // person needs in order to decide: a file name, what it read as, a date, a row. Never the document.
  if (SERVE) {
    const runId = process.env.STEWARD_RUN_ID;
    const bucketOf = (x) => (x.alreadyLinked || x.dup) ? "done" : x.sure ? "ready" : "needs";
    const reasonOf = (x) => x.alreadyLinked ? "Already linked on your list. Tick it only if this is a newer copy."
      : x.dup ? "An item with this name is already in 1Password."
      : !x.kind ? "Could not tell what this is. Pick the row it belongs to, or leave it out."
      : !x.rowIds.length ? "Could not tell whose it is. Pick the row."
      : "Check the date, then it is ready.";
    const body = items.map((x) => ({
      import_id: runId, file_name: x.name, file_count: x.files?.length ?? 1, is_pdf: /\.pdf$/i.test(x.file),
      kind: x.kind || null, reads_as: x.kind ? KIND_LABEL[x.kind] : null, title: x.title, vault_id: x.vaultId,
      vault_name: (vaults.find((v) => v.id === x.vaultId) || {}).name || null,
      expires_on: /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null, date_note: x.dateFrom || null,
      preview: x.preview, bucket: bucketOf(x), reason: reasonOf(x), row_ids: x.rowIds, include: !x.skip,
    }));
    if (body.length) await sb("vault_import_items", { method: "POST", body: JSON.stringify(body) });
    await sb(`vault_imports?id=eq.${runId}`, { method: "PATCH", body: JSON.stringify({ status: "ready", scanned_at: new Date().toISOString(), found: items.length }) });
    console.log(`Sent ${items.length} to the app; waiting for the go-ahead there.`);

    // The person is deciding. Nothing happens on this Mac until they tap Add.
    let run = null;
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      run = (await sb(`vault_imports?id=eq.${runId}&select=status,delete_folder`))[0];
      if (!run || run.status !== "ready") break;
    }
    if (!run || run.status !== "applying") { console.log("The run was left; nothing was created."); return; }

    const chosen = await sb(`vault_import_items?import_id=eq.${runId}&include=is.true&select=id,file_name,title,vault_id,expires_on,note,row_ids,bucket&order=created_at`);
    let made = 0;
    for (const w of chosen) {
      const x = items.find((q) => q.name === w.file_name);
      const mark = (text) => sb(`vault_import_items?id=eq.${w.id}`, { method: "PATCH", body: JSON.stringify({ result: text }) });
      try {
        if (!x) { await mark("could not find that file again"); continue; }
        const targets = (w.row_ids || []).map((id) => rows.find((q) => q.id === id)).filter(Boolean);
        if (!targets.length) { await mark("skipped: no row picked"); continue; }
        const title = String(w.title || targets[0].label).trim().slice(0, 120);
        const created = JSON.parse(op(["document", "create", x.file, "--title", title, "--vault", w.vault_id, "--file-name", basename(x.file), "--tags", "StewardOS", "--format", "json"]));
        for (const extra of (x.files ?? []).slice(1)) {
          try { op(["item", "edit", created.id, "--vault", w.vault_id, `Attachments.${basename(extra).replace(/[^A-Za-z0-9]+/g, "_")}[file]=${extra}`]); } catch { /* the first page is attached; a second is a bonus */ }
        }
        // Where it came from, in the item itself: two passports in a vault should say which is which.
        try { op(["item", "edit", created.id, "--vault", w.vault_id, `notesPlain=Added by StewardOS from ${basename(x.file)} on ${new Date().toISOString().slice(0, 10)}`]); } catch { /* the note is a nicety */ }
        const link = `https://start.1password.com/open/i?a=${me.account_uuid}&v=${created.vault?.id ?? w.vault_id}&i=${created.id}&h=${host}`;
        const patch = { link, updated_at: new Date().toISOString() };
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(w.expires_on || ""))) patch.expires_on = w.expires_on;
        if (w.note) patch.note = String(w.note).slice(0, 300);
        for (const t of targets) {
          const [a] = await sb(`vault_pointers?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify(patch) });
          if (!a?.link) throw new Error(`the row "${t.label}" did not take the link`);
          if (a.attached_kind === "vehicle" && patch.expires_on && (x.kind === "registration" || x.kind === "auto_card")) {
            const v = vehicles.find((q) => q.id === a.attached_id);
            if (v) {
              const cur = (await sb(`vehicles?id=eq.${v.id}&select=details`))[0]?.details ?? {};
              const field = x.kind === "registration" ? "regExpiry" : "insuranceExpiry";
              await sb(`vehicles?id=eq.${v.id}`, { method: "PATCH", body: JSON.stringify({ details: { ...cur, [field]: patch.expires_on } }) });
            }
          }
        }
        made++;
        await mark(`created in 1Password and linked to ${targets.map((t) => t.label).join(", ")}`);
      } catch (e) { await mark(`failed: ${e.message}`.slice(0, 300)); }
    }
    let deleted = null;
    if (run.delete_folder) {
      try { rmSync(FOLDER, { recursive: true, force: true }); deleted = new Date().toISOString(); console.log(`Deleted ${FOLDER}.`); }
      catch (e) { console.log(`Could not delete the folder: ${e.message}`); }
    }
    await sb(`vault_imports?id=eq.${runId}`, { method: "PATCH", body: JSON.stringify({ status: "done", applied_at: new Date().toISOString(), created: made, folder_deleted_at: deleted }) });
    console.log(`Created ${made} of ${chosen.length}.`);
    return;
  }

  // ---------- the mapping screen ----------
  const token = randomBytes(12).toString("hex");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rowOptions = (sel) => rows.map((r) => `<option value="${r.id}" ${sel.includes(r.id) ? "selected" : ""}>${esc(r.label)}${r.link ? " (already linked)" : ""}</option>`).join("");
  const vaultOptions = (sel) => vaults.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.name)}</option>`).join("");
  // The mapping screen. Three groups, top to bottom: what needs a decision, what is ready to go, what is already done.
  // Every field is editable; nothing is written until Apply, which stays in view at the bottom.
  const groupOf = (x) => (x.alreadyLinked || x.dup) ? "done" : x.sure ? "ready" : "needs";
  const card = (x) => {
    const g = groupOf(x);
    const why = x.alreadyLinked ? "This document is already linked on the list." : x.dup ? "An item with this name is already in 1Password." : !x.kind ? "Could not tell what this is. Pick the row it belongs to, or leave it unticked." : !x.rowIds.length ? "Could not tell whose it is. Pick the row." : "Check the date, then it is ready.";
    const read = [x.kind ? KIND_LABEL[x.kind] : "unknown kind", x.person, x.vehicle].filter(Boolean).join(" · ");
    return `
<section class="card ${g}" id="c${x.i}">
  <div class="thumb">${/\.pdf$/i.test(x.file) ? `<div class="pdf">PDF</div>` : `<img src="/file/${x.i}?t=${token}" alt="">`}<div class="fname">${esc(x.name)}</div>${(x.files?.length ?? 1) > 1 ? `<div class="fname">${x.files.length} files → one item</div>` : ""}</div>
  <div class="body">
    <div class="top"><label class="inc"><input type="checkbox" name="go${x.i}" ${x.skip ? "" : "checked"}> <span>Include</span></label><span class="pill ${g}">${g === "needs" ? "Needs you" : g === "ready" ? "Ready" : "Already done"}</span></div>
    <div class="read"><b>Read from the scan:</b> ${esc(read)}${x.dateFrom ? ` · <b>date:</b> ${esc(x.dateFrom)}` : ""}</div>
    <div class="why">${esc(why)}</div>
    <div class="field"><div class="lbl">Goes to this row on the list <span class="hint">(⌘-click to pick several when one card covers several people)</span></div>
      <input class="filter" placeholder="Type to find a row…" oninput="filt(this)"><select name="row${x.i}" multiple size="6">${rowOptions(x.rowIds)}</select></div>
    <div class="grid3">
      <div class="field"><div class="lbl">Name in 1Password</div><input name="title${x.i}" value="${esc(x.title)}"></div>
      <div class="field"><div class="lbl">Vault</div><select name="vault${x.i}">${vaultOptions(x.vaultId)}</select></div>
      <div class="field"><div class="lbl">Expires or renews</div><input type="date" name="date${x.i}" value="${esc(x.date)}"></div>
    </div>
    <div class="field"><div class="lbl">Note (optional)</div><input name="note${x.i}" placeholder="Original in the safe"></div>
    <details class="ocr"><summary>What the scan says</summary><div>${esc(x.preview)}</div></details>
    <div class="res" id="r${x.i}"></div>
  </div>
</section>`;
  };
  const page = () => {
    const needs = items.filter((x) => groupOf(x) === "needs"), ready = items.filter((x) => groupOf(x) === "ready"), done = items.filter((x) => groupOf(x) === "done");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Map your documents</title>
<style>
:root{--accent:#0F4C81;--fg:#111;--muted:#444;--line:#d9d9de;--bg:#f2f3f5}
*{box-sizing:border-box}body{font:15px/1.4 -apple-system,system-ui,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);padding:14px 20px;z-index:2}
header h1{font-size:20px;margin:0 0 4px}header p{margin:0;color:var(--muted);font-size:14px}
main{max-width:1060px;margin:0 auto;padding:16px 20px 110px}
h2{font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:22px 0 8px}
.card{background:#fff;border-radius:14px;padding:16px;margin:10px 0;display:grid;grid-template-columns:160px minmax(0,1fr);gap:16px;box-shadow:0 1px 2px #0002;border:2px solid transparent}
.card.needs{border-color:#e6a700}.card.done{opacity:.6}
.thumb img{width:160px;max-height:200px;object-fit:contain;border-radius:8px;background:#e9e9ee}.pdf{width:160px;height:120px;border-radius:8px;background:#e9e9ee;display:flex;align-items:center;justify-content:center;font-weight:700;color:#555}
.fname{font-size:12px;color:var(--muted);margin-top:6px;word-break:break-word}
.top{display:flex;align-items:center;gap:10px;margin-bottom:6px}.inc{display:flex;align-items:center;gap:8px;font-weight:700}.inc input{width:20px;height:20px;accent-color:var(--accent)}
.pill{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px}.pill.needs{background:#fff1c2;color:#7a5a00}.pill.ready{background:#d9f5dd;color:#1b5e20}.pill.done{background:#e6e6ea;color:#444}
.read{font-size:14px;margin:4px 0}.why{font-size:14px;color:var(--muted);margin-bottom:10px}
.field{margin-top:10px}.lbl{font-size:13px;font-weight:700;margin-bottom:4px}.hint{font-weight:400;color:var(--muted)}
input,select{width:100%;padding:9px 10px;border:1px solid #b9b9c2;border-radius:8px;font:inherit;color:var(--fg);background:#fff}select[multiple]{padding:4px}
.filter{margin-bottom:6px}.grid3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}
.ocr{margin-top:10px;font-size:13px;color:var(--muted)}.ocr summary{cursor:pointer;font-weight:700}.ocr div{margin-top:4px;max-height:120px;overflow:auto}
.res{font-size:14px;font-weight:700;margin-top:8px}.res.ok{color:#1b5e20}.res.bad{color:#b00020}
footer{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:14px 20px;display:flex;align-items:center;gap:14px;z-index:2}
button{padding:12px 22px;border-radius:999px;border:0;background:var(--accent);color:#fff;font:inherit;font-weight:700;font-size:15px}button:disabled{opacity:.5}
#status{color:var(--muted)}
@media (max-width:700px){.card{grid-template-columns:1fr}.grid3{grid-template-columns:1fr}}
</style></head><body>
<header><h1>Map your documents</h1><p>${items.length} scans read on this Mac. Nothing leaves it. Fix anything that is wrong, tick what should go, then Apply: each ticked scan becomes a 1Password item (with the scan attached) and fills its row on the list.</p></header>
<main><form id="f">
${needs.length ? `<h2>Needs you (${needs.length})</h2>` + needs.map(card).join("") : ""}
${ready.length ? `<h2>Ready (${ready.length})</h2>` + ready.map(card).join("") : ""}
${done.length ? `<h2>Already done (${done.length}) — unticked; tick one only to replace what is there</h2>` + done.map(card).join("") : ""}
</form></main>
<footer><button type="button" id="go" onclick="go()">Apply</button><span id="count"></span><span id="status"></span></footer>
<script>
const f=document.getElementById('f');
function filt(inp){const q=inp.value.toLowerCase();const sel=inp.nextElementSibling;for(const o of sel.options)o.hidden=q&&!o.text.toLowerCase().includes(q)}
function count(){const n=[...f.querySelectorAll('input[type=checkbox]:checked')].length;document.getElementById('count').textContent=n+' ticked';document.getElementById('go').textContent='Apply '+n}
f.addEventListener('change',count);count();
document.querySelectorAll('select[multiple]').forEach(sel=>{const o=sel.querySelector('option:checked');if(o)sel.scrollTop=Math.max(0,o.offsetTop-sel.clientHeight/2)});
async function go(){const d=new FormData(f);const rows=[];${JSON.stringify(items.map((x) => x.i))}.forEach(i=>{if(!d.get('go'+i))return;rows.push({i,rowIds:d.getAll('row'+i),title:d.get('title'+i),vaultId:d.get('vault'+i),date:d.get('date'+i),note:d.get('note'+i)})});
if(!rows.length){alert('Nothing is ticked.');return}if(!confirm(rows.length+' scan'+(rows.length===1?'':'s')+': create the 1Password items and fill the list?'))return;document.getElementById('go').disabled=true;document.getElementById('status').textContent='Working… each row reports as it finishes.';
const r=await fetch('/apply?t=${token}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rows)});const out=await r.json();
for(const o of out){const el=document.getElementById('r'+o.i);el.className='res '+(o.ok?'ok':'bad');el.textContent=o.text;el.scrollIntoView({block:'nearest'})}
document.getElementById('status').textContent='Done: '+out.filter(o=>o.ok).length+' of '+out.length+' written. You can close this window and press Ctrl-C in Terminal.'}
</script></body></html>`;
  };

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
// What is in the Import folder right now: readable files (the same kinds main() reads), newest change. Hidden files and
// anything deeper than four levels are ignored, exactly as the reader ignores them.
function importFolderState() {
  try { mkdirSync(IMPORT_DIR, { recursive: true }); } catch { /* exists, or cannot: reported below as 0 files */ }
  let files = 0, newest = 0;
  const walk = (dir, depth = 0) => { let list = []; try { list = readdirSync(dir); } catch { return; } for (const f of list) { if (f.startsWith(".")) continue; const p = join(dir, f); let st; try { st = statSync(p); } catch { continue; } if (st.isDirectory() && depth < 4) walk(p, depth + 1); else if (st.isFile() && /\.(pdf|jpe?g|png|heic|tiff?)$/i.test(f)) { files++; if (st.mtimeMs > newest) newest = st.mtimeMs; } } };
  walk(IMPORT_DIR);
  return { files, newest: newest ? new Date(newest).toISOString() : null };
}

let lastReported = "";
async function reportImportFolder() {
  const st = importFolderState();
  const sig = `${st.files}|${st.newest}`;
  if (sig === lastReported) return;             // nothing changed: no write, no churn in the status table
  await sb("system_status?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: "vault_import_folder", state: "ok", summary: `${DEFAULT_FOLDER}: ${st.files} file${st.files === 1 ? "" : "s"}${st.newest ? `, last added ${st.newest}` : ""}`, value_num: st.files, updated_at: new Date().toISOString() }]) });
  lastReported = sig;
}

async function serveLoop() {
  console.log(`Watching ${IMPORT_DIR} and waiting for the app (Settings > 1Password > Map your documents). Ctrl-C to stop.`);
  for (;;) {
    try {
      await reportImportFolder();
      const [run] = await sb("vault_imports?status=eq.requested&select=id,folder&order=requested_at&limit=1");
      if (run) {
        const asked = String(run.folder ?? "").trim();
        FOLDER = !asked || asked === DEFAULT_FOLDER || asked === "default" ? IMPORT_DIR : resolve(asked.replace(/^~/, HOME));
        process.env.STEWARD_RUN_ID = run.id;
        // Claim it only if it is still 'requested': when a Terminal window and the launchd job are both running, one of
        // them gets the run and the other sees an empty answer and goes back to waiting.
        const claimed = await sb(`vault_imports?id=eq.${run.id}&status=eq.requested`, { method: "PATCH", body: JSON.stringify({ status: "scanning", picked_at: new Date().toISOString() }) });
        if (!Array.isArray(claimed) || !claimed.length) { await new Promise((r) => setTimeout(r, 4000)); continue; }
        console.log(`\nReading ${FOLDER} for the app…`);
        try { await main(); }
        catch (e) {
          console.error(`That run failed: ${e.message}`);
          await sb(`vault_imports?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error: String(e.message).slice(0, 300) }) });
        }
        lastReported = "";                       // the folder may have been deleted or emptied: report it fresh
      }
    } catch (e) { console.error(`(could not reach the app: ${e.message})`); }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

if (SERVE) serveLoop();
else main().catch((e) => { console.error(`STOP: ${e.message}`); process.exit(1); });
