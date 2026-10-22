#!/usr/bin/env node
// Google sign-in for one account, run by hand on the Mac mini. No dependencies: Node 20+.
//
//   node scripts/google-auth.mjs --account admin@shvr.co
//
// What it does: opens Google's consent page in your browser (OAuth "Desktop app" flow with PKCE, loopback
// redirect on 127.0.0.1), receives the one-time code on a throwaway local port, exchanges it for a refresh
// token, checks the token really belongs to the account you named and has the scopes we need, then saves it.
//
// Safety rules:
//   - Tokens are written ONLY to ~/_secrets_local_only/email-agent/google-<account>.json (mode 600), never printed,
//     never sent anywhere except Google's own token endpoint. The file is created with "wx": an existing token
//     file is never overwritten (revoke it at myaccount.google.com/permissions and delete it by hand to redo).
//   - If you sign in with a different Google account than --account, nothing is saved.
//   - Read-only checks after sign-in: Gmail profile (address, message count) and the Calendar list (count only).
//   - Scopes requested: gmail.modify, gmail.compose, calendar.events, calendar.readonly. No gmail.send.
//
// Client file: ~/_secrets_local_only/email-agent/google-oauth-client.json (the Desktop-app JSON from Google Cloud).

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const account = (opt("--account") || "").trim().toLowerCase();
const dir = join(homedir(), "_secrets_local_only", "email-agent");
const clientPath = opt("--client") || join(dir, "google-oauth-client.json");
const NO_OPEN = args.includes("--no-open");
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const die = (m) => { console.error(`STOP: ${m}`); process.exit(2); };
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) die("pass --account <the Google address you are signing in with>");
const tokenPath = join(dir, `google-${account}.json`);
if (existsSync(tokenPath)) die(`${tokenPath} already exists. Not overwriting. To redo: revoke access at myaccount.google.com/permissions, delete that file, run again.`);

let client;
try {
  const j = JSON.parse(readFileSync(clientPath, "utf8"));
  client = j.installed || j.web;
  if (!client?.client_id || !client?.client_secret) throw new Error("missing client_id/client_secret");
} catch (e) { die(`cannot read the OAuth client file (${clientPath}): ${e.message}`); }

const b64 = (b) => b.toString("base64url");
const verifier = b64(randomBytes(48));
const challenge = b64(createHash("sha256").update(verifier).digest());
const state = b64(randomBytes(16));

const server = createServer();
const port = await new Promise((res, rej) => { server.once("error", rej); server.listen(0, "127.0.0.1", () => res(server.address().port)); });
const redirect = `http://127.0.0.1:${port}/`;

const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: client.client_id, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "),
  access_type: "offline", prompt: "consent", login_hint: account, state,
  code_challenge: challenge, code_challenge_method: "S256",
}).toString();

const codePromise = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timed out after 5 minutes waiting for the browser")), 5 * 60 * 1000);
  server.on("request", (req, res) => {
    const u = new URL(req.url, redirect);
    if (u.pathname !== "/") { res.writeHead(404).end(); return; }
    // A request without our one-time state is not from this sign-in: answer it and keep waiting.
    if (u.searchParams.get("state") !== state) { res.writeHead(400, { "Content-Type": "text/plain" }).end("Not part of this sign-in."); return; }
    const err = u.searchParams.get("error");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (err || !u.searchParams.get("code")) {
      res.end("<p>Sign-in did not complete. You can close this tab and look at Terminal.</p>");
      clearTimeout(timer);
      reject(new Error(err ? `Google returned: ${err}` : "no code returned"));
      return;
    }
    res.end("<p>Done. You can close this tab and return to Terminal.</p>");
    clearTimeout(timer);
    resolve(u.searchParams.get("code"));
  });
});

console.log(`Signing in ${account}. Listening on ${redirect} (this port exists only for this sign-in).`);
if (NO_OPEN) console.log("Open this address in a browser signed in to that account:\n" + authUrl);
else {
  console.log("Opening your browser… If it does not open, paste this address into it:\n" + authUrl);
  try { spawn("open", [authUrl], { stdio: "ignore", detached: true }).unref(); } catch { /* the printed URL still works */ }
}

async function main() {
  const code = await codePromise;
  server.close();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: client.client_id, client_secret: client.client_secret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier }),
  });
  const tok = await r.json();
  if (!r.ok) throw new Error(`token exchange failed: ${tok.error || r.status} ${tok.error_description || ""}`.trim());
  if (!tok.refresh_token) throw new Error("Google returned no refresh token. Revoke this app at myaccount.google.com/permissions and run again.");

  const granted = String(tok.scope || "").split(/\s+/);
  const missing = SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) throw new Error(`not all permissions were granted; missing: ${missing.map((s) => s.split("/").pop()).join(", ")}. Run again and tick every box. Nothing saved.`);

  const get = async (url) => { const x = await fetch(url, { headers: { Authorization: `Bearer ${tok.access_token}` } }); if (!x.ok) throw new Error(`${url.split("?")[0]} → ${x.status}`); return x.json(); };
  const profile = await get("https://gmail.googleapis.com/gmail/v1/users/me/profile");
  if (String(profile.emailAddress || "").toLowerCase() !== account) throw new Error(`you signed in as ${profile.emailAddress}, not ${account}. Nothing saved.`);
  const cals = await get("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250");

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(tokenPath, JSON.stringify({ account, refresh_token: tok.refresh_token, scope: tok.scope, saved_at: new Date().toISOString() }, null, 2), { flag: "wx", mode: 0o600 });
  chmodSync(tokenPath, 0o600);

  console.log("\nPASS");
  console.log(`  account:        ${profile.emailAddress}`);
  console.log(`  gmail messages: ${profile.messagesTotal}`);
  console.log(`  calendars:      ${(cals.items || []).length}`);
  console.log(`  permissions:    ${granted.map((s) => s.split("/").pop()).join(", ")}`);
  console.log(`  saved:          ${tokenPath} (mode 600)`);
}

main().catch((e) => { try { server.close(); } catch {} console.error(`FAILED: ${e.message}`); process.exit(1); });
