#!/usr/bin/env node
// publish-materials.mjs — puts the customer-facing files on the public site.
// Watches ~/Organized/Business/Veil Labs/04_Product/StewardOS/ and uploads any file that changed to the
// public `site` storage bucket, where the overview page (stewardos site, /overview) reads it. The file on
// the hub stays the master: edit it in place and the public page follows within ten minutes.
// Only files in that one folder are ever published; never records, never anything under Personal.
// Runs under launchd every 10 minutes (com.ryan.publish-materials.plist) or by hand: node scripts/publish-materials.mjs
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const HOME = homedir();
const FOLDER = join(HOME, "Organized", "Business", "Veil Labs", "04_Product", "StewardOS");
const STATE_DIR = join(HOME, "Library", "Application Support", "StewardOS");
const STATE = join(STATE_DIR, "publish-materials.json");
const BUCKET = "site";
const TYPES = { ".md": "text/markdown", ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf" };

const readEnv = (p) => { const e = {}; if (existsSync(p)) for (const l of readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, ""); } return e; };
const app = readEnv(join(HOME, "_secrets_local_only", "family-dashboard.env"));
const URL = app.SUPABASE_URL || app.NEXT_PUBLIC_SUPABASE_URL, KEY = app.SUPABASE_SERVICE_KEY || app.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in ~/_secrets_local_only/family-dashboard.env"); process.exit(1); }

if (!existsSync(FOLDER)) { console.log(`${new Date().toISOString()} nothing to publish: ${FOLDER} does not exist`); process.exit(0); }
mkdirSync(STATE_DIR, { recursive: true });
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};

let published = 0, skipped = 0, failed = 0;
for (const name of readdirSync(FOLDER)) {
  const ext = extname(name).toLowerCase();
  if (!TYPES[ext] || name.startsWith(".")) continue;
  const abs = join(FOLDER, name);
  if (!statSync(abs).isFile()) continue;
  const body = readFileSync(abs);
  const sha = createHash("sha256").update(body).digest("hex");
  if (state[name] === sha) { skipped++; continue; }
  const r = await fetch(`${URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": TYPES[ext], "x-upsert": "true", "Cache-Control": "max-age=300" }, body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) { failed++; console.error(`${new Date().toISOString()} ${name} → ${r.status} ${(await r.text()).slice(0, 200)}`); continue; }
  state[name] = sha; published++;
  console.log(`${new Date().toISOString()} published ${name} (${body.length} bytes)`);
}
writeFileSync(STATE, JSON.stringify(state, null, 2));
console.log(`${new Date().toISOString()} publish: ${published} published, ${skipped} unchanged, ${failed} failed`);
process.exit(failed ? 1 : 0);
