// One-time and rerunnable: give every already-filed receipt ONE home (D69): Finance/<year>/<card>/<month>/, and record that path.
// It MOVES the file (a rename inside ~/Organized: no copy, no delete), then records the new path on the receipt and its Inbox item.
// Refuses to overwrite: if the destination already holds a file of that name, that receipt is skipped and reported.
// If recording the path fails after a move, the file is moved straight back. Dry run by default.
//   node scripts/rehome-receipts.mjs            # shows what would move
//   node scripts/rehome-receipts.mjs --apply    # moves, records, and verifies
import { readFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, dirname, resolve } from "node:path";
import { receiptHome, destFolder } from "./filing-agent.mjs";

// Pure: where should these files go? current = absolute paths now on disk; returns {skip:reason} or {moves:[{from,to}], home:string}.
export function planRehome(currentPaths, receipt, exists = existsSync, now = Date.now()) {
  const homeRel = receiptHome(receipt, now);
  if (!homeRel) return { skip: "card not firm yet (still waiting)" };
  const dir = destFolder(homeRel);
  if (!dir) return { skip: "no safe destination" };
  const moves = [];
  for (const from of currentPaths) {
    if (!from) continue;
    const to = join(dir, basename(from));
    if (resolve(from) === resolve(to)) { moves.push({ from, to, already: true }); continue; }
    if (exists(to)) return { skip: `a file already exists at ${to}` };
    if (!exists(from)) return { skip: `the file is not at ${from}` };
    moves.push({ from, to });
  }
  if (!moves.length) return { skip: "no file path recorded" };
  return { moves, home: moves[0].to };
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const envPath = join(homedir(), "_secrets_local_only", "family-dashboard.env");
  const env = {};
  try { for (const line of readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* below */ }
  const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) { console.error("STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY not found in ~/_secrets_local_only/family-dashboard.env"); process.exit(2); }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const rest = async (method, path, body, extra = {}) => { const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; };
  if (!existsSync(join(homedir(), "Organized"))) { console.error("STOP: ~/Organized not found; is this the Mac mini?"); process.exit(2); }

  console.log(`REHOME RECEIPTS — ${APPLY ? "APPLY" : "DRY RUN (nothing will move)"}\n`);
  const items = await rest("GET", "inbox_items?status=eq.resolved&copied_at=not.is.null&filed=not.is.null&select=id,title,copied_path,filed&order=copied_at.asc&limit=1000");
  let moved = 0, recorded = 0, skipped = 0, failed = 0;
  const done = [];
  for (const it of items) {
    const rid = it.filed?.receipt_id; if (!rid) continue;
    const rc = (await rest("GET", `receipts?id=eq.${rid}&select=id,merchant,amount,date,card,card_confidence,card_conflict,created_at,home_path`))?.[0];
    if (!rc || rc.home_path) continue;                       // only receipts with no recorded home
    const current = String(it.copied_path ?? "").split("\n").filter(Boolean);
    const plan = planRehome(current, rc);
    if (plan.skip) { skipped++; console.log(`SKIP  ${rc.merchant}: ${plan.skip}`); continue; }
    for (const m of plan.moves) console.log(`${m.already ? "KEEP " : "MOVE "} ${m.from}\n   →  ${m.to}`);
    if (!APPLY) continue;
    const did = [];
    try {
      for (const m of plan.moves) { if (m.already) continue; mkdirSync(dirname(m.to), { recursive: true }); renameSync(m.from, m.to); did.push(m); }
      const newPaths = plan.moves.map((m) => m.to);
      await rest("PATCH", `inbox_items?id=eq.${it.id}`, { copied_path: newPaths.join("\n") }, { Prefer: "return=minimal" });
      await rest("PATCH", `receipts?id=eq.${rc.id}`, { home_path: plan.home }, { Prefer: "return=minimal" });
      moved += did.length; recorded++; done.push({ rid: rc.id, iid: it.id, home: plan.home, files: newPaths, old: current });
    } catch (e) {
      failed++; console.log(`FAILED ${rc.merchant}: ${e.message}`);
      for (const m of did.reverse()) { try { renameSync(m.to, m.from); console.log(`   put back ${m.from}`); } catch (e2) { console.log(`   COULD NOT PUT BACK ${m.to}: ${e2.message}`); } }
    }
  }
  if (!APPLY) { console.log(`\nDry run only. Would handle ${items.length ? "the items above" : "nothing"}; ${skipped} skipped. To write: add --apply`); return; }
  // verify: every recorded file is on disk at its new path, gone from the old one, and the database says the same
  let bad = 0;
  for (const d of done) {
    const rc = (await rest("GET", `receipts?id=eq.${d.rid}&select=home_path`))?.[0];
    const it = (await rest("GET", `inbox_items?id=eq.${d.iid}&select=copied_path`))?.[0];
    const ok = rc?.home_path === d.home && String(it?.copied_path ?? "") === d.files.join("\n") && d.files.every((f) => existsSync(f)) && d.old.every((o) => d.files.includes(o) || !existsSync(o));
    if (!ok) { bad++; console.log(`NOT VERIFIED: ${d.home}`); }
  }
  console.log(`\nMOVED ${moved} file(s), recorded ${recorded} receipt(s), ${skipped} skipped, ${failed} failed.`);
  console.log(`VERIFIED on disk and in the database: ${done.length - bad} of ${done.length}.`);
  if (bad || failed) { console.log("NOT ALL VERIFIED. Paste this output back to Claude."); process.exit(1); }
  console.log("All verified. Nothing was copied or deleted. The filing agent rewrites the index pages on its next run (within 10 minutes).");
}
if (process.argv[1] && process.argv[1].endsWith("rehome-receipts.mjs")) main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
