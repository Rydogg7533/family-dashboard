#!/usr/bin/env node
// vault-import.mjs — fills the Settings › 1Password list from 1Password itself (Ryan, 2026-10-28).
//
//   --plan     list 1Password items (titles and ids only, never contents), match each to a row on the list, build the
//              private link, fetch each matched item's attachment, OCR it on this Mac (Apple Vision), pull the expiry or
//              renewal date with rules, and write ONE review file: ~/_secrets_local_only/vault-import.csv. Writes nothing
//              to the app. Downloaded scans are deleted when the plan is done.
//   --apply    read that CSV back (after you have checked it) and fill link and date on each row marked fill; a vehicle's
//              registration or insurance date also goes onto the vehicle. Prints what changed, read back from the database.
//   --status   how many rows are linked, dated, and still open.
//
// Needs: the 1Password CLI (`op`) signed in on this Mac; scripts/ocr/stewardos-ocr built; the service key in
// ~/_secrets_local_only/family-dashboard.env. Nothing here reads a secret out of 1Password: `op item list` gives titles and
// ids; the only thing downloaded is the attachment (the scan), which stays on this Mac and is removed after OCR.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";

const args = process.argv.slice(2);
const MODE = args.includes("--apply") ? "apply" : args.includes("--status") ? "status" : "plan";
// --account <shorthand|email|url>: which 1Password account, when the Mac has more than one (the family one, not a business one).
const ACCOUNT = (() => { const i = args.indexOf("--account"); return i >= 0 ? args[i + 1] : process.env.OP_ACCOUNT || ""; })();
const HOME = homedir();
const SECRETS = join(HOME, "_secrets_local_only");
const CSV = join(SECRETS, "vault-import.csv");
const OCR = resolve(dirname(new URL(import.meta.url).pathname), "ocr", "stewardos-ocr");

const env = {};
try { for (const line of readFileSync(join(SECRETS, "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* below */ }
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error("STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY missing from ~/_secrets_local_only/family-dashboard.env"); process.exit(1); }

const sb = async (path, init = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", prefer: init.method === "PATCH" ? "return=representation" : "", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

// Same normalisation as src/lib/vault.ts labelKey, so the match agrees with the app.
const key = (l) => String(l ?? "").toLowerCase().replace(/[’']s\b/g, "").replace(/\s*\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const toks = (l) => new Set(key(l).split(" ").filter((w) => w.length > 1 && !["the", "and", "of", "card", "cards", "number", "numbers", "account", "documents", "document"].includes(w)));
const EXPIRES = new Set(["passport", "license", "traveler", "registration", "auto_card", "auto_policy", "home_insurance", "health_card", "dental_card", "domains", "biz_insurance", "life_insurance"]);
const kindOf = (tk) => String(tk ?? "").split(":")[0];

// ---------- dates in OCR text ----------
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
    yield { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, at: m.index, raw: m[0] };
  }
}
// The expiry: a date on a line that says expires/exp/valid through/policy period/renewal; the LATEST such date wins
// (a policy period is "from X to Y"; a passport has issue and expiry). Fallback: the latest date in the text, marked guess.
function expiryIn(text) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const ctx = `${lines[i]} ${lines[i + 1] ?? ""}`;
    if (!/\b(exp|expir|expires|expiration|valid (through|thru|until|to)|policy period|effective|renew|renewal|through|coverage|end date|good thru)\b/i.test(lines[i])) continue;
    for (const d of datesIn(ctx)) hits.push({ ...d, line: lines[i].trim().slice(0, 120), sure: true });
  }
  if (hits.length) return hits.sort((a, b) => b.iso.localeCompare(a.iso))[0];
  const all = [...datesIn(text)];
  if (!all.length) return null;
  const best = all.sort((a, b) => b.iso.localeCompare(a.iso))[0];
  return { ...best, line: "(no 'expires' wording; latest date on the document)", sure: false };
}

// ---------- 1Password CLI ----------
function op(argv, opts = {}) {
  if (ACCOUNT) argv = [...argv, "--account", ACCOUNT];
  const r = spawnSync("op", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000, stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.status !== 0) throw new Error(`op ${argv.slice(0, 3).join(" ")}: ${(r.stderr || "").trim().slice(0, 300)}`);
  return r.stdout;
}
const opJson = (argv) => JSON.parse(op([...argv, "--format", "json"]));

function csvEscape(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

async function status() {
  const rows = await sb(`vault_pointers?select=id,label,link,expires_on,template_key&deleted_at=is.null`);
  const needDate = rows.filter((r) => r.link && !r.expires_on && EXPIRES.has(kindOf(r.template_key)));
  console.log(`${rows.length} rows: ${rows.filter((r) => r.link).length} linked, ${rows.filter((r) => !r.link).length} without a link, ${needDate.length} linked but missing their date.`);
  for (const r of needDate) console.log(`  needs date: ${r.label}`);
}

async function plan() {
  if (!existsSync(OCR)) { console.error(`STOP: ${OCR} is not built. Run: swiftc -O -o scripts/ocr/stewardos-ocr scripts/ocr/stewardos-ocr.swift`); process.exit(1); }
  const accounts = JSON.parse(spawnSync("op", ["account", "list", "--format", "json"], { encoding: "utf8" }).stdout || "[]");
  if (!accounts.length) { console.error("STOP: op is not signed in. Run: op signin"); process.exit(1); }
  if (accounts.length > 1 && !ACCOUNT) {
    console.error("STOP: this Mac has more than one 1Password account. Say which with --account, e.g.\n" + accounts.map((a) => `  node scripts/vault-import.mjs --plan --account ${a.shorthand || a.url}   (${a.email ?? ""} at ${a.url ?? ""})`).join("\n"));
    process.exit(1);
  }
  const me = opJson(["whoami"]);
  const acct = accounts.find((a) => a.account_uuid === me.account_uuid) ?? accounts[0];
  const host = String(acct.url || me.url || "my.1password.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const accountUuid = me.account_uuid || acct.account_uuid;
  console.log(`Using 1Password account ${me.email ?? acct.email ?? ""} at ${host}.`);
  const items = opJson(["item", "list"]);
  console.log(`1Password: ${items.length} items across ${new Set(items.map((i) => i.vault?.name)).size} vaults (titles only).`);
  const rows = await sb(`vault_pointers?select=id,label,link,expires_on,template_key,attached_kind,attached_id&deleted_at=is.null&order=label`);
  console.log(`List: ${rows.length} rows, ${rows.filter((r) => !r.link).length} without a link.`);

  // Match each list row to the best 1Password title: exact key, then token overlap.
  const scored = rows.map((r) => {
    const rk = key(r.label), rt = toks(r.label);
    let best = null;
    for (const it of items) {
      const ik = key(it.title), itks = toks(it.title);
      let s = 0;
      if (ik === rk) s = 1;
      else { let n = 0; for (const t of rt) if (itks.has(t)) n++; s = rt.size ? n / Math.max(rt.size, itks.size) : 0; if (n && n === rt.size) s = Math.max(s, 0.85); }
      if (!best || s > best.s) best = { it, s };
    }
    return { r, it: best && best.s >= 0.5 ? best.it : null, s: best?.s ?? 0 };
  });
  const tmp = join(tmpdir(), `stewardos-vault-${Date.now()}`); mkdirSync(tmp, { recursive: true });
  const out = [["row_id", "list_label", "op_title", "op_vault", "match", "link", "date_found", "date_from", "current_date", "action"]];
  let fetched = 0;
  try {
    for (const { r, it, s } of scored) {
      const match = !it ? "none" : s >= 1 ? "exact" : s >= 0.85 ? "good" : "guess";
      const link = it ? `https://start.1password.com/open/i?a=${accountUuid}&v=${it.vault.id}&i=${it.id}&h=${host}` : "";
      let date = "", from = "";
      if (it && EXPIRES.has(kindOf(r.template_key)) && !r.expires_on) {
        try {
          const full = opJson(["item", "get", it.id]);
          const files = (full.files ?? []).filter((f) => /\.(pdf|jpe?g|png|heic|tiff?)$/i.test(f.name || ""));
          const isDoc = /^document$/i.test(full.category || "");
          if (isDoc || files.length) {
            const f = files[0];
            const dest = join(tmp, `${it.id}-${(f?.name || "document.pdf").replace(/[^A-Za-z0-9._-]/g, "_")}`);
            if (existsSync(dest)) rmSync(dest, { force: true });
            if (isDoc) op(["document", "get", it.id, "--out-file", dest, "--force"]); else op(["read", `op://${it.vault.name}/${it.id}/${f.name}`, "--out-file", dest, "--force"]);
            fetched++;
            const o = spawnSync(OCR, [dest], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 });
            let j = null; try { j = JSON.parse(o.stdout || ""); } catch { /* unreadable */ }
            const text = (j?.pages ?? []).map((p) => p.text).join("\n");
            const e = text ? expiryIn(text) : null;
            if (e) { date = e.iso; from = `${e.sure ? "" : "GUESS: "}${e.line} [${e.raw}]`; } else from = text ? "no date found in the scan" : "scan not readable";
          } else from = "no attachment on the item";
        } catch (err) { from = `could not fetch: ${String(err.message).slice(0, 120)}`; }
      }
      const action = it ? (r.link && !date ? "skip" : "fill") : "skip";
      out.push([r.id, r.label, it?.title ?? "", it?.vault?.name ?? "", match, r.link ? "(already linked)" : link, date, from, r.expires_on ?? "", action]);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  mkdirSync(SECRETS, { recursive: true });
  writeFileSync(CSV, out.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n", { mode: 0o600 });
  const n = (m) => scored.filter((x) => (!x.it ? "none" : x.s >= 1 ? "exact" : x.s >= 0.85 ? "good" : "guess") === m).length;
  console.log(`\nPlan written to ${CSV}`);
  console.log(`Matches: ${n("exact")} exact, ${n("good")} good, ${n("guess")} guesses (check these), ${n("none")} with no 1Password item found.`);
  console.log(`Scans fetched and read: ${fetched}; dates found: ${out.slice(1).filter((r) => r[6]).length}. Downloaded scans were deleted.`);
  console.log(`\nOpen the CSV, check the guess rows and every date, set action to skip for anything you do not want, then run: node scripts/vault-import.mjs --apply`);
}

async function apply() {
  if (!existsSync(CSV)) { console.error(`STOP: ${CSV} not found. Run --plan first.`); process.exit(1); }
  const rows = parseCsv(readFileSync(CSV, "utf8")).filter((r) => r.action === "fill");
  const vehicles = await sb(`vehicles?select=id,short,details`);
  let changed = 0;
  for (const r of rows) {
    const patch = {};
    if (r.link && !r.link.startsWith("(") && /^https:\/\/start\.1password\.com\/open\//.test(r.link)) patch.link = r.link;
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.date_found)) patch.expires_on = r.date_found;
    if (!Object.keys(patch).length) continue;
    patch.updated_at = new Date().toISOString();
    const [after] = await sb(`vault_pointers?id=eq.${r.row_id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (!after) { console.log(`  not written: ${r.list_label}`); continue; }
    changed++;
    console.log(`  ${after.label}: ${patch.link ? "linked" : ""}${patch.link && patch.expires_on ? ", " : ""}${patch.expires_on ? `date ${after.expires_on}` : ""}`);
    // A vehicle's registration or insurance date lives on the vehicle too (its reminders read from there), so it goes there once.
    const kind = kindOf(after.template_key);
    if (after.attached_kind === "vehicle" && patch.expires_on && (kind === "registration" || kind === "auto_card")) {
      const v = vehicles.find((x) => x.id === after.attached_id);
      if (v) {
        const field = kind === "registration" ? "regExpiry" : "insuranceRenewal";
        const details = { ...(v.details ?? {}), [field]: patch.expires_on };
        const [vv] = await sb(`vehicles?id=eq.${v.id}`, { method: "PATCH", body: JSON.stringify({ details, updated_at: new Date().toISOString() }) });
        if (vv) console.log(`    and Vehicles › ${v.short} › ${field === "regExpiry" ? "Registration expires" : "Insurance renews"} = ${vv.details?.[field]}`);
      }
    }
  }
  console.log(`\n${changed} row${changed === 1 ? "" : "s"} written, each read back above.`);
  await status();
}

(MODE === "plan" ? plan() : MODE === "apply" ? apply() : status()).catch((e) => { console.error(`STOP: ${e.message}`); process.exit(1); });
