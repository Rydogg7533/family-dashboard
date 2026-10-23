// One-time: create the web-push VAPID key pair and store it in the secrets env file on the Mac mini.
// Never overwrites. If keys already exist it changes nothing and just prints the PUBLIC key.
// The private key is written to the file and never printed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";

const f = path.join(os.homedir(), "_secrets_local_only", "family-dashboard.env");
if (!fs.existsSync(f)) { console.log("STOP: env file not found at " + f + " (run this on the Mac mini)"); process.exit(1); }
const cur = fs.readFileSync(f, "utf8");
const has = (k) => new RegExp("^" + k + "=.{20,}$", "m").test(cur);
const get = (k) => (cur.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1];

if (has("VAPID_PRIVATE_KEY") && has("VAPID_PUBLIC_KEY")) {
  console.log("Keys already exist. Nothing changed.");
  console.log("PUBLIC KEY:\n" + get("VAPID_PUBLIC_KEY"));
  process.exit(0);
}
if (has("VAPID_PRIVATE_KEY") || has("VAPID_PUBLIC_KEY")) {
  console.log("STOP: only half a key pair is in the file. Nothing changed. Tell Claude.");
  process.exit(1);
}
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const j = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]).toString("base64url");
fs.appendFileSync(f, (cur.endsWith("\n") ? "" : "\n") + `VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${j.d}\nVAPID_SUBJECT=mailto:admin@shvr.co\n`);
fs.chmodSync(f, 0o600);
const after = fs.readFileSync(f, "utf8");
console.log("saved:", /^VAPID_PRIVATE_KEY=.{40,}$/m.test(after) ? "private key present (not shown)" : "PROBLEM");
console.log("PUBLIC KEY:\n" + pub);
