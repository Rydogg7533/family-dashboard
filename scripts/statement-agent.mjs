#!/usr/bin/env node
// statement-agent.mjs — the hub's half of Money › Statements (Ryan, 2026-10-30). Needs Node 22.18+.
//
//   1. Picks up rows in statement_uploads with status 'uploaded' (an owner uploaded a statement to the private "statements" bucket).
//   2. Copies that one file to a scratch folder on this Mac, reads it with the Mac's own OCR (scripts/ocr/stewardos-ocr: PDF text, else Apple Vision),
//      and parses it with src/lib/statement-parse.ts. NO MODEL: nothing is sent to any AI service, and no statement text leaves this process.
//   3. Writes back shape only: which account (matched by last four digits), which month, closing date, closing balance, whether the arithmetic
//      ties, and the names (never values) of fields it could not find. If the account or month is unknown the row becomes 'needs_account' and
//      an owner picks them in the app; the next run finishes it without reading the file again.
//   4. Files a local copy under ~/Organized/Personal/Documents/Finance/<year>/Statements/<account>/ and records the statement for that account
//      and month (account_statements), which is what the monthly routine counts as "received".
//
// Pull only: the hub makes outbound HTTPS calls and nothing connects to it. Copies, never overwrites: an existing local file gets a " (2)" suffix.
// Never deletes a file or row; the only thing removed is this run's own scratch folder (the temporary copy it downloaded), as vault-import does.
// Never prints statement text or amounts: logs carry ids and statuses only.
// Runs under launchd (module "statement-agent" in scripts/hub.mjs). Secrets from ~/_secrets_local_only/family-dashboard.env.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, copyFileSync, constants, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseStatement, tieNote } from "../src/lib/statement-parse.ts";
import { matchAccount, statementName, statementHome } from "../src/lib/statement-match.ts";

const HOME = homedir();
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const OCR = join(REPO, "scripts", "ocr", "stewardos-ocr");
const env = {};
try { for (const line of readFileSync(join(HOME, "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error(`STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY not found in ${join(HOME, "_secrets_local_only", "family-dashboard.env")}`); process.exit(2); }
if (!existsSync(OCR)) { console.error(`STOP: ${OCR} is not built. Run: swiftc -O -o scripts/ocr/stewardos-ocr scripts/ocr/stewardos-ocr.swift`); process.exit(2); }

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const rest = async (method, path, body, extra = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation", ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status}`);   // the path and status only: never a response body
  return t ? JSON.parse(t) : null;
};
const log = (id, what) => console.log(`${new Date().toISOString()} ${String(id).slice(0, 8)} ${what}`);

async function download(path, dest) {
  const url = `${SB_URL}/storage/v1/object/statements/${path.split("/").map(encodeURIComponent).join("/")}`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`download → ${r.status}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()), { mode: 0o600 });
}

const extOf = (row) => { const e = extname(row.original_name || "").toLowerCase(); if ([".pdf", ".jpg", ".jpeg", ".png"].includes(e)) return e; return row.mime === "image/png" ? ".png" : row.mime === "image/jpeg" ? ".jpg" : ".pdf"; };

// A copy under Organized, never overwriting: a name already taken gets " (2)", " (3)" ...
function fileLocally(src, period, acct, ext) {
  if (!existsSync(join(HOME, "Organized"))) return null;
  const relDir = statementHome(period, acct);
  mkdirSync(join(HOME, relDir), { recursive: true });
  const base = statementName(period, acct).replace(/[\\/:*?"<>|]/g, "");
  for (let n = 1; n < 50; n++) {
    const name = `${base}${n === 1 ? "" : ` (${n})`}${ext}`;
    try { copyFileSync(src, join(HOME, relDir, name), constants.COPYFILE_EXCL); return relDir + name; }
    catch (e) { if (e.code === "EEXIST") continue; throw e; }
  }
  return null;
}

async function finalize(row, acct, period, src, ext, facts) {
  const local = fileLocally(src, period, acct, ext);
  const res = await fetch(`${SB_URL}/rest/v1/account_statements`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ account_id: acct.id, period, upload_id: row.id, file_path: row.file_path, name: statementName(period, acct), closing_date: facts.closing_date ?? null, statement_balance: facts.statement_balance ?? null, filed_by: "statement-agent" }) });
  if (!res.ok && res.status !== 409) throw new Error(`account_statements → ${res.status}`);   // 409: already recorded by an earlier run
  await rest("PATCH", `statement_uploads?id=eq.${row.id}`, { status: "read", account_id: acct.id, period, local_copy: local, error: null }, { Prefer: "return=minimal" });
  log(row.id, `filed for ${acct.id} ${period}${local ? "" : " (no local copy: ~/Organized not found)"}`);
}

async function fail(row, reason) {
  await rest("PATCH", `statement_uploads?id=eq.${row.id}`, { status: "failed", error: String(reason).slice(0, 200), read_at: new Date().toISOString() }, { Prefer: "return=minimal" }).catch(() => {});
  log(row.id, `failed: ${String(reason).slice(0, 120)}`);
}

// Scratch space on this Mac only (not in any cloud-synced folder). Removed when the run is done.
function scratch() { const root = join(HOME, "StewardOS", "tmp"); mkdirSync(root, { recursive: true, mode: 0o700 }); return mkdtempSync(join(root, "stmt-")); }

async function readNew(row, accounts) {
  const claimed = await rest("PATCH", `statement_uploads?id=eq.${row.id}&status=eq.uploaded`, { status: "reading", picked_at: new Date().toISOString() });
  if (!claimed?.length) return;                                    // another run has it
  const dir = scratch();
  try {
    const ext = extOf(row), file = join(dir, `statement${ext}`);
    await download(row.file_path, file);
    const o = spawnSync(OCR, [file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 });
    let j; try { j = JSON.parse(o.stdout || "{}"); } catch { return fail(row, "the OCR tool gave no usable output"); }
    if (j.error) return fail(row, `OCR: ${String(j.error).slice(0, 80)}`);
    const pages = (j.pages ?? []).filter((p) => p.source !== "unreadable");
    const text = pages.map((p) => p.text).join("\n\n");
    if (text.replace(/\s+/g, "").length < 60) return fail(row, "no readable text found (try a clearer scan or the original PDF)");
    const sources = new Set(pages.map((p) => p.source));
    const read_source = sources.size === 1 ? [...sources][0] : "mixed";

    const r = parseStatement(text);
    let acct = null;
    for (const c of r.last4Candidates) { acct = matchAccount(accounts, c); if (acct) break; }
    const facts = { closing_date: r.closingDate, statement_balance: r.closing };
    await rest("PATCH", `statement_uploads?id=eq.${row.id}`, { read_at: new Date().toISOString(), read_source, page_count: pages.length, closing_date: r.closingDate, statement_balance: r.closing, tie_ok: r.tie ? r.tie.ok : null, tie_note: tieNote(r), missing: r.missing }, { Prefer: "return=minimal" });
    if (acct && r.period) await finalize(row, acct, r.period, file, ext, facts);
    else { await rest("PATCH", `statement_uploads?id=eq.${row.id}`, { status: "needs_account", account_id: acct?.id ?? null, period: r.period }, { Prefer: "return=minimal" }); log(row.id, "needs an account or month from an owner"); }
  } catch (e) { await fail(row, e.message ?? e); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

// An owner chose the account and month in the app: finish without reading the file again.
async function finishPicked(row, accounts) {
  const acct = accounts.find((a) => a.id === row.account_id);
  if (!acct) return fail(row, "that account no longer exists");
  const dir = scratch();
  try {
    const ext = extOf(row), file = join(dir, `statement${ext}`);
    await download(row.file_path, file);
    await finalize(row, acct, row.period, file, ext, { closing_date: row.closing_date, statement_balance: row.statement_balance });
  } catch (e) { await fail(row, e.message ?? e); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

// A run that crashed leaves a row "reading": hand it back after 15 minutes.
await rest("PATCH", `statement_uploads?status=eq.reading&picked_at=lt.${encodeURIComponent(new Date(Date.now() - 15 * 60_000).toISOString())}`, { status: "uploaded" }, { Prefer: "return=minimal" });

const fresh = await rest("GET", "statement_uploads?status=eq.uploaded&order=uploaded_at.asc&limit=5");
const picked = await rest("GET", "statement_uploads?status=eq.needs_account&account_id=not.is.null&period=not.is.null&order=uploaded_at.asc&limit=5");
if (!fresh?.length && !picked?.length) process.exit(0);
const accounts = (await rest("GET", "accounts?select=id,institution,last4,retired_at")) ?? [];
for (const row of fresh ?? []) await readNew(row, accounts);
for (const row of picked ?? []) await finishPicked(row, accounts);
