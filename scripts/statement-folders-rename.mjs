#!/usr/bin/env node
// statement-folders-rename.mjs — one time: statement folders named by account id -> named by the account label ("Wells Fargo ····6918").
//   node scripts/statement-folders-rename.mjs --dry    # report only
//   node scripts/statement-folders-rename.mjs          # rename
// Only renames a folder in place (same parent). Refuses when the new name already exists. Never overwrites, moves between parents, or deletes.
// Also updates statement_uploads.local_copy where it names the old folder. Prints folder names only.
import { readFileSync, existsSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { statementFolder } from "../src/lib/statement-match.ts";
const HOME = homedir(), DRY = process.argv.includes("--dry");
const env = {};
try { for (const line of readFileSync(join(HOME, "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* below */ }
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("STOP: Supabase keys not found"); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const accts = await (await fetch(`${URL_}/rest/v1/accounts?select=id,institution,last4,retired_at`, { headers: H })).json();
const FIN = join(HOME, "Organized/Personal/Documents/Finance");
let renamed = 0, skipped = 0, problems = 0;
for (const year of existsSync(FIN) ? readdirSync(FIN) : []) {
  const base = join(FIN, year, "Statements");
  if (!existsSync(base)) continue;
  for (const dir of readdirSync(base)) {
    const a = accts.find((x) => x.id === dir);
    if (!a) { skipped++; continue; }
    const to = statementFolder(a);
    if (to === dir) { skipped++; continue; }
    if (existsSync(join(base, to))) { problems++; console.log(`REFUSE ${year}/${dir}: "${to}" already exists`); continue; }
    if (DRY) { console.log(`WOULD  ${year}: ${dir}  →  ${to}`); renamed++; continue; }
    renameSync(join(base, dir), join(base, to)); renamed++;
    console.log(`RENAMED ${year}: ${dir}  →  ${to}`);
    const oldP = `Organized/Personal/Documents/Finance/${year}/Statements/${dir}/`, newP = `Organized/Personal/Documents/Finance/${year}/Statements/${to}/`;
    const rows = await (await fetch(`${URL_}/rest/v1/statement_uploads?select=id,local_copy&local_copy=like.${encodeURIComponent(oldP + "*")}`, { headers: H })).json();
    for (const r of rows) await fetch(`${URL_}/rest/v1/statement_uploads?id=eq.${r.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ local_copy: newP + r.local_copy.slice(oldP.length) }) });
  }
}
console.log(`\n${renamed} folders ${DRY ? "would be renamed" : "renamed"}, ${skipped} left alone, ${problems} refused.`);
process.exit(problems ? 1 : 0);
