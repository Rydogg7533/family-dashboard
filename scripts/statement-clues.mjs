#!/usr/bin/env node
// statement-clues.mjs — shape-only clues for statements the reader could not place (American Express, Apple Card).
// Prints per PDF ONLY: a file fingerprint (first 12 chars of sha256), page count, the digit groups that follow "ending"/"account"/"card",
// and the dates found. No amounts, names, merchants or text. Reads on this Mac with the local OCR; no model, no upload.
//   node scripts/statement-clues.mjs "<folder>"
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const dir = process.argv[2];
if (!dir || !existsSync(dir)) { console.error('STOP: give the folder'); process.exit(2); }
const OCR = join(dirname(dirname(fileURLToPath(import.meta.url))), "scripts", "ocr", "stewardos-ocr");
const MON = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
for (const f of readdirSync(dir).filter((x) => extname(x).toLowerCase() === ".pdf" && /american express|apple card/i.test(x)).sort()) {
  const p = join(dir, f), sha = createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
  const o = spawnSync(OCR, [p], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 });
  let j = {}; try { j = JSON.parse(o.stdout || "{}"); } catch { /* none */ }
  const pages = (j.pages ?? []).filter((x) => x.source !== "unreadable"), text = pages.map((x) => x.text).join("\n").replace(/\s+/g, " ");
  if (text.length < 60) { console.log(`${f}\n   fingerprint ${sha}   could not read`); continue; }
  const ends = new Set();
  for (const m of text.matchAll(/(?:ending(?:\s+in)?|account\s+number|card\s+number|acct\.?)\D{0,12}((?:[0-9Xx*•.-]{0,12})[0-9]{4,5})\b/gi)) ends.add(m[1].replace(/[^0-9-]/g, "").replace(/^-/, ""));
  const dates = new Set();
  for (const m of text.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g)) dates.add(m[1]);
  for (const m of text.matchAll(new RegExp(`\\b((?:${MON})[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4})\\b`, "gi"))) dates.add(m[1]);
  const d = [...dates].slice(0, 10);
  console.log(`${f}\n   fingerprint ${sha}   pages ${pages.length}\n   digits after "ending"/"account"/"card": ${[...ends].slice(0, 8).join(", ") || "none"}\n   dates found: ${d.join("; ") || "none"}`);
}
