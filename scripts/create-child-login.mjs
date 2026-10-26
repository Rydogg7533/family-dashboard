#!/usr/bin/env node
// One-off, run by a parent on the Mac mini: node scripts/create-child-login.mjs "Audrey" 2010 email@example.com
// Mirrors createChildLogin in src/app/settings/people/children-actions.ts. The password is read from the clipboard (pbpaste),
// never printed or stored. Refuses to run if the child already has a login or the email is taken.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
const [name, yearArg, emailArg] = process.argv.slice(2);
const year = Number(yearArg), email = (emailArg || "").trim().toLowerCase();
if (!name || !(year > 1990) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Usage: node scripts/create-child-login.mjs "Audrey" 2010 email@example.com'); process.exit(1); }
const env = {};
for (const line of readFileSync(join(homedir(), "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set"); process.exit(1); }
const password = execSync("pbpaste", { encoding: "utf8" }).trim();
if (password.length < 12 || /\s/.test(password)) { console.error("Clipboard does not hold a passphrase (12+ characters, no spaces). Run the passphrase command again, then retry."); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = async (path, opts = {}) => { const r = await fetch(`${URL}/rest/v1/${path}`, { ...opts, headers: { ...H, Prefer: "return=representation", ...(opts.headers || {}) } }); const t = await r.text(); if (!r.ok) throw new Error(`${path}: ${r.status} ${t}`); return t ? JSON.parse(t) : []; };
const main = async () => {
  let [child] = await rest(`children?display_name=eq.${encodeURIComponent(name)}&archived_at=is.null&select=*`);
  if (child?.profile_id) { console.error(`${name} already has a login. Nothing changed.`); process.exit(1); }
  if (!child) { [child] = await rest("children", { method: "POST", body: JSON.stringify({ display_name: name, birth_year: year }) }); console.log(`Added ${name} (born ${year}) to the family.`); }
  const ur = await fetch(`${URL}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: name } }) });
  const u = await ur.json();
  if (!ur.ok || !u.id) { console.error(`Could not create the login: ${u.msg || u.message || ur.status}. Nothing else changed.`); process.exit(1); }
  await rest("profiles", { method: "POST", body: JSON.stringify({ id: u.id, display_name: name, role: "child" }) });
  await rest(`children?id=eq.${child.id}`, { method: "PATCH", body: JSON.stringify({ profile_id: u.id }) });
  await rest("activity_log", { method: "POST", body: JSON.stringify({ actor: "Ryan", action: "child_login_created", subject: `Created a login for ${name}`, undoable: false }) });
  const [chk] = await rest(`children?id=eq.${child.id}&select=display_name,birth_year,profile_id`);
  const [prof] = await rest(`profiles?id=eq.${u.id}&select=display_name,role`);
  console.log("Verified:", JSON.stringify({ child: chk.display_name, born: chk.birth_year, linked: chk.profile_id === u.id, profile: prof, email }));
};
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
