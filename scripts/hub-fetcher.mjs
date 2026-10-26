#!/usr/bin/env node
// hub-fetcher.mjs — the hub's half of retrieval (D104). Polls fetch_requests, copies each requested file
// from ~/Organized into the private "deliveries" bucket, marks the row delivered. Pull only: the hub makes
// outbound HTTPS calls and nothing connects to it. Copies, never moves; never deletes.
//
// Runs under launchd every 15 s (scripts/com.ryan.hub-fetcher.plist). Secrets from
// ~/_secrets_local_only/family-dashboard.env (SUPABASE_URL, SUPABASE_SERVICE_KEY). Never in the repo.
import { readFileSync, statSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, resolve, extname } from "node:path";

const secrets = join(homedir(), "_secrets_local_only");
const ROOT = resolve(homedir(), "Organized");            // the only tree this will read from
const MAX_BYTES = 50 * 1024 * 1024;
const env = {};
try { for (const line of readFileSync(join(secrets, "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error(`STOP: SUPABASE_URL / SUPABASE_SERVICE_KEY not found in ${join(secrets, "family-dashboard.env")}`); process.exit(2); }

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const rest = async (method, path, body, extra = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation", ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};
const MIME = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".heic": "image/heic", ".gif": "image/gif", ".txt": "text/plain", ".csv": "text/csv", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".eml": "message/rfc822" };

async function deliver(req) {
  await rest("PATCH", `fetch_requests?id=eq.${req.id}`, { picked_at: new Date().toISOString() }, { Prefer: "return=minimal" });
  // The path is relative to the home folder and must stay inside ~/Organized once symlinks are resolved.
  const rel = String(req.path).replace(/^\/+/, "");
  if (!rel.startsWith("Organized/") || rel.includes("..")) throw new Error("path is not under Organized");
  const abs = realpathSync(resolve(homedir(), rel));
  if (!abs.startsWith(ROOT + "/")) throw new Error("path resolves outside Organized");
  const st = statSync(abs);
  if (!st.isFile()) throw new Error("not a file");
  if (st.size > MAX_BYTES) throw new Error(`file is ${Math.round(st.size / 1048576)} MB; the limit is 50 MB`);
  const name = basename(abs);
  const key = `${req.id}/${name}`;
  const up = await fetch(`${SB_URL}/storage/v1/object/deliveries/${encodeURIComponent(req.id)}/${encodeURIComponent(name)}`, { method: "POST", headers: { ...H, "Content-Type": MIME[extname(name).toLowerCase()] ?? "application/octet-stream", "x-upsert": "true" }, body: readFileSync(abs) });
  if (!up.ok) throw new Error(`upload → ${up.status} ${(await up.text()).slice(0, 200)}`);
  await rest("PATCH", `fetch_requests?id=eq.${req.id}`, { delivered_at: new Date().toISOString(), storage_path: key }, { Prefer: "return=minimal" });
  console.log(`${new Date().toISOString()} delivered ${rel} (${st.size} bytes)`);
}

const open = await rest("GET", "fetch_requests?delivered_at=is.null&error=is.null&order=requested_at.asc&limit=20");
for (const req of open ?? []) {
  try { await deliver(req); }
  catch (e) {
    const msg = String(e.message ?? e).slice(0, 300);
    console.error(`${new Date().toISOString()} ${req.id}: ${msg}`);
    await rest("PATCH", `fetch_requests?id=eq.${req.id}`, { error: msg }, { Prefer: "return=minimal" }).catch(() => {});
  }
}
if (!open?.length) process.exit(0);
