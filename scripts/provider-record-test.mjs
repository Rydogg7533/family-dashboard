// The AI company is named in one place (src/lib/ai-provider.ts). No notice, page or call may type it. Guard + behaviour test.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AI_PROVIDER, sentTo, aiUploadNote } from "../src/lib/ai-provider.ts";
let bad = 0;
const eq = (n, a, b) => { if (a !== b) { bad++; console.log(`FAIL ${n}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
eq("cloud sentTo", sentTo({ company: "Acme AI", runtime: "cloud", endpoint: "x" }), "sent to Acme AI");
eq("local sentTo", sentTo({ company: "Acme AI", runtime: "local", endpoint: "x" }), "read on your Mac");
eq("cloud note names the company", /sent to Acme AI/.test(aiUploadNote("", { company: "Acme AI", runtime: "cloud", endpoint: "x" })), true);
eq("local note has no warning", /not private|sent to/.test(aiUploadNote("x", { company: "Acme AI", runtime: "local", endpoint: "x" })), false);
eq("local note says stored in the app", /stored in your app/.test(aiUploadNote("", { company: "A", runtime: "local", endpoint: "x" })), true);
// Guard: the company name and API host are typed nowhere else under src/ (setup instructions for the Console account are allowed).
const ALLOW = [/src\/lib\/ai-provider\.ts$/, /src\/lib\/preonboard-/];
const names = [AI_PROVIDER.company, new URL(AI_PROVIDER.endpoint).host];
function walk(d, out = []) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx)$/.test(p) && out.push(p); } return out; }
for (const f of walk("src")) {
  if (ALLOW.some((r) => r.test(f))) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => { if (/^\s*(\/\/|\*|\/\*)/.test(l)) return; for (const n of names) if (l.includes(n)) { bad++; console.log(`FAIL ${f}:${i + 1} types "${n}"`); } });
}
console.log(bad ? `${bad} FAILED` : "provider record: all passed");
process.exit(bad ? 1 : 0);
