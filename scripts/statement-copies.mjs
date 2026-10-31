#!/usr/bin/env node
// statement-copies.mjs — keeps a local copy of every statement filed from the Inbox, named and placed like the ones the statement agent files:
//   ~/Organized/Personal/Documents/Finance/<year>/Statements/<account id>/<YYYY-MM> <Account label> statement.<ext>
//   node scripts/statement-copies.mjs --dry     # report only: what is present, what is missing
//   node scripts/statement-copies.mjs           # copy what is missing (also what launchd runs)
// COPY ONLY. Never overwrites, renames, moves or deletes a file; a name that already exists is left alone and reported.
// Downloads one statement at a time from the private captures bucket to memory, writes it with the exclusive flag. Prints ids/names only, never contents.
import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { statementName, statementHome } from "../src/lib/statement-match.ts";

const HOME = homedir(), DRY = process.argv.includes("--dry");
const env = {};
try { for (const line of readFileSync(join(HOME, "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* below */ }
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error("STOP: Supabase keys not found in ~/_secrets_local_only/family-dashboard.env"); process.exit(2); }
if (!existsSync(join(HOME, "Organized"))) { console.error("STOP: ~/Organized not found"); process.exit(2); }
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const get = async (p) => { const r = await fetch(`${SB_URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`GET ${p.split("?")[0]} → ${r.status}`); return r.json(); };

const accts = await get("accounts?select=id,institution,last4,retired_at");
const byId = new Map(accts.map((a) => [a.id, a]));
const rows = await get("account_statements?select=id,account_id,period,file_path,inbox_id&replaced_at=is.null&inbox_id=not.is.null&order=account_id.asc,period.asc&limit=2000");
let present = 0, copied = 0, problems = 0, would = 0;
for (const s of rows) {
  const a = byId.get(s.account_id);
  if (!a || !s.file_path) { problems++; console.log(`SKIP  ${s.account_id} ${s.period}: ${!a ? "account not found" : "no stored file"}`); continue; }
  const dir = join(HOME, statementHome(s.period, a)), base = statementName(s.period, a), ext = extname(s.file_path).toLowerCase() || ".pdf";
  const have = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(base)) : [];
  if (have.length) { present++; console.log(`HAVE  ${s.account_id} ${s.period}`); continue; }
  if (DRY) { would++; console.log(`WOULD ${s.account_id} ${s.period} → ${statementHome(s.period, a)}${base}${ext}`); continue; }
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/captures/${s.file_path.split("/").map(encodeURIComponent).join("/")}`, { headers: H });
    if (!r.ok) throw new Error(`download → ${r.status}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, base + ext), Buffer.from(await r.arrayBuffer()), { flag: "wx", mode: 0o600 });
    copied++; console.log(`COPIED ${s.account_id} ${s.period} → ${statementHome(s.period, a)}${base}${ext}`);
  } catch (e) { problems++; console.log(`FAIL  ${s.account_id} ${s.period}: ${e.message ?? e}`); }
}
console.log(`\n${rows.length} Inbox-filed statements: ${present} already local, ${DRY ? `${would} would be copied` : `${copied} copied`}, ${problems} problems.`);
process.exit(problems ? 1 : 0);
