#!/usr/bin/env node
// Puts the lines of a KEY=value file into the app's Vercel settings WITHOUT showing the values. Run by hand on the Mac mini.
//
//   node scripts/vercel-env-from-file.mjs ~/_secrets_local_only/email-agent/google-<account>.calendar.env
//
// Two ways, picked automatically:
//   1. If the Vercel CLI is signed in and this folder is linked to the project (`npx vercel link` once), each value is
//      added with `vercel env add NAME production preview development` through stdin. Nothing is printed.
//   2. Otherwise a clipboard walk-through: each value is copied to the clipboard in turn (pbcopy) and you paste it into
//      Vercel → Project → Settings → Environment Variables. The value never appears on screen.
// Afterwards redeploy once (Vercel → Deployments → ⋯ → Redeploy) so the running app picks the values up.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const file = process.argv[2];
if (!file) { console.error("STOP: pass the env file path"); process.exit(2); }
const pairs = readFileSync(file.replace(/^~/, process.env.HOME), "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]);
if (!pairs.length) { console.error("STOP: no KEY=value lines in that file"); process.exit(2); }

const cli = spawnSync("npx", ["--yes", "vercel", "whoami"], { encoding: "utf8" });
const signedIn = cli.status === 0 && !/error/i.test(cli.stdout + cli.stderr);
if (signedIn) {
  console.log(`Vercel CLI signed in as ${cli.stdout.trim()}. Adding ${pairs.length} values (nothing printed).`);
  let ok = 0;
  for (const [k, v] of pairs) {
    for (const env of ["production", "preview", "development"]) {
      const r = spawnSync("npx", ["--yes", "vercel", "env", "add", k, env, "--force"], { input: v + "\n", encoding: "utf8" });
      if (r.status !== 0) { console.error(`  ${k} (${env}): ${(r.stderr || r.stdout).split("\n").find((l) => /error/i.test(l)) || "failed"} — if it says the project is not linked, run: npx vercel link`); process.exit(1); }
    }
    ok++; console.log(`  added ${k}`);
  }
  console.log(`Done: ${ok} values. Now redeploy once in Vercel so the app picks them up.`);
} else {
  console.log(`Vercel CLI is not signed in here, so: clipboard walk-through. Open https://vercel.com → family-dashboard → Settings → Environment Variables in a browser.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));
  for (const [k, v] of pairs) {
    spawnSync("pbcopy", [], { input: v });
    await ask(`  Copied the value of ${k} to the clipboard. Add a variable named ${k}, paste the value, save. Press Enter for the next one…`);
  }
  spawnSync("pbcopy", [], { input: "" });   // clear the clipboard
  rl.close();
  console.log("Done. Clipboard cleared. Now redeploy once in Vercel so the app picks them up.");
}
