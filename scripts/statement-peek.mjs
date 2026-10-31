#!/usr/bin/env node
// statement-peek.mjs — which account is each PDF in a folder? Prints, per file, ONLY: the file name, the last-four candidates, the closing date the
// reader finds, and the matching account (if exactly one). Reads on this Mac with the local OCR tool. No model, no upload, no amounts or text printed.
//   node scripts/statement-peek.mjs "<folder>"
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseStatement } from "../src/lib/statement-parse.ts";
import { matchAccount, accountLabel } from "../src/lib/statement-match.ts";
import { resolvePeriod } from "../src/lib/statement-checks.ts";
const HOME = homedir(), REPO = dirname(dirname(fileURLToPath(import.meta.url))), OCR = join(REPO, "scripts", "ocr", "stewardos-ocr");
const dir = process.argv[2];
if (!dir || !existsSync(dir)) { console.error('STOP: give the folder, e.g. node scripts/statement-peek.mjs "~/path/to/folder"'); process.exit(2); }
const env = {};
for (const line of readFileSync(join(HOME, "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
const accts = (await (await fetch(`${URL_}/rest/v1/accounts?select=id,institution,last4,retired_at`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json()).filter((a) => !a.retired_at);
for (const f of readdirSync(dir).sort()) {
  if (extname(f).toLowerCase() !== ".pdf") { if (/\.csv$/i.test(f)) console.log(`${f}\n   (CSV: not a statement, skipped)`); continue; }
  const o = spawnSync(OCR, [join(dir, f)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 });
  let j; try { j = JSON.parse(o.stdout || "{}"); } catch { j = {}; }
  const text = (j.pages ?? []).filter((p) => p.source !== "unreadable").map((p) => p.text).join("\n\n");
  if (text.replace(/\s+/g, "").length < 60) { console.log(`${f}\n   could not read`); continue; }
  const r = parseStatement(text);
  const hits = [...new Set(r.last4Candidates)].map((c) => ({ c, a: matchAccount(accts, c) }));
  const pr = resolvePeriod({ closing_date: r.closingDate }, f);
  console.log(`${f}\n   last four on the page: ${r.last4Candidates.join(", ") || "none found"}  →  ${hits.filter((h) => h.a).map((h) => accountLabel(h.a)).join(" / ") || "no account of yours matches"}\n   closing date: ${r.closingDate ?? "not found"}   month: ${pr.period ?? "unknown"}`);
}
