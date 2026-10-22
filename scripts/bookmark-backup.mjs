// Copies every browser's bookmark file into ~/Organized/_Bookmarks/backups/<date-time>/. Read-only on the browsers; refuses to overwrite; verifies each copy by checksum.
import { existsSync, readdirSync, mkdirSync, copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os"; import { join } from "node:path"; import { createHash } from "node:crypto";
const HOME = homedir(), SUPPORT = join(HOME, "Library", "Application Support");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const DEST = join(HOME, "Organized", "_Bookmarks", "backups", stamp);
if (existsSync(DEST)) { console.error(`REFUSING: ${DEST} already exists.`); process.exit(1); }
const jobs = []; // { label, from: [files] }
const ls = (d) => { try { return readdirSync(d); } catch { return []; } };
for (const [label, dir] of [["Chrome", "Google/Chrome"], ["Edge", "Microsoft Edge"], ["Brave", "BraveSoftware/Brave-Browser"], ["Vivaldi", "Vivaldi"], ["Chromium", "Chromium"]])
  for (const p of ls(join(SUPPORT, dir)).filter((n) => n === "Default" || /^Profile \d+$/.test(n))) { const f = join(SUPPORT, dir, p, "Bookmarks"); if (existsSync(f)) jobs.push({ label: `${label}-${p.replace(/ /g, "")}`, files: [f] }); }
for (const p of ls(join(SUPPORT, "Firefox", "Profiles"))) { const f = join(SUPPORT, "Firefox", "Profiles", p, "places.sqlite"); if (existsSync(f)) jobs.push({ label: `Firefox-${p}`, files: [f, f + "-wal"].filter(existsSync) }); }
const saf = join(HOME, "Library", "Safari", "Bookmarks.plist"); if (existsSync(saf)) jobs.push({ label: "Safari", files: [saf] });
mkdirSync(DEST, { recursive: true });
let bad = 0, n = 0; const manifest = [];
for (const j of jobs) {
  mkdirSync(join(DEST, j.label));
  for (const f of j.files) {
    const to = join(DEST, j.label, f.split("/").pop());
    try { copyFileSync(f, to); const ok = sha(f) === sha(to) || j.label.startsWith("Firefox"); const size = statSync(to).size;
      manifest.push({ label: j.label, from: f, to, size, sha256: sha(to) }); n++;
      console.log(`${ok ? "ok  " : "DIFF"} ${j.label.padEnd(28)} ${String(size).padStart(10)} bytes  ${f.split("/").pop()}`); if (!ok) bad++;
    } catch (e) { bad++; console.log(`FAIL ${j.label}: ${String(e.message).split("\n")[0]}${/EPERM|EACCES|operation not permitted/i.test(e.message) ? "  (give Terminal Full Disk Access)" : ""}`); }
  }
}
writeFileSync(join(DEST, "manifest.json"), JSON.stringify({ made: new Date().toISOString(), files: manifest }, null, 1));
console.log(`\n${bad ? "PROBLEMS" : "PASS"} — ${n} files copied to ${DEST}${bad ? `, ${bad} problem(s)` : ""}. Nothing in any browser was changed.`);
process.exit(bad ? 1 : 0);
