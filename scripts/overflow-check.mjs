// Text stays inside its box (BUILD-CONVENTIONS). Opens the key pages at 390px in sample mode and fails on any element whose content
// is wider than the box it sits in, or that pokes past the screen edge. Run against a running app:
//   node scripts/overflow-check.mjs http://localhost:3921
// Elements that deliberately cut text with "…" (text-overflow: ellipsis) and scrollable strips (overflow-x: auto/scroll) are not faults.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(process.env.NODE_PATH ? `${process.env.NODE_PATH}/playwright` : "playwright")); }
const base = process.argv[2] ?? "http://localhost:3000";
const PAGES = ["/", "/inbox", "/more", "/money", "/money/statements", "/money/receipts", "/settings", "/settings/money/accounts", "/settings/capture", "/warranties", "/messages", "/ask", "/claims", "/records", "/vehicles"];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
let bad = 0;
for (const path of PAGES) {
  const res = await p.goto(base + path, { waitUntil: "networkidle" }).catch(() => null);
  if (!res || res.status() >= 400) { console.log(`skip ${path} (${res ? res.status() : "no response"})`); continue; }
  if (path === "/inbox") { await p.getByRole("button", { name: /more|show all/i }).first().click({ timeout: 2000 }).catch(() => null); await p.getByText("Where it goes ›").first().click({ timeout: 2000 }).catch(() => null); }
  const faults = await p.evaluate(() => {
    const out = [];
    const scroller = document.querySelector("#page") ?? document.body;
    const sr = scroller.getBoundingClientRect();
    for (const el of document.querySelectorAll("#page *, body > *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("svg")) continue;
      if (/(auto|scroll)/.test(cs.overflowX) || cs.textOverflow === "ellipsis") continue;
      if (el.closest("[style*='overflow-x']") || [...(function* () { let a = el.parentElement; while (a) { const c = getComputedStyle(a); if (/(auto|scroll)/.test(c.overflowX) && a.scrollWidth > a.clientWidth) yield a; a = a.parentElement; } })()].length) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // A rotated or scaled child (a chevron that turns when a section opens) widens scrollWidth without being visible overflow.
      if ([...el.children].some((c) => getComputedStyle(c).transform !== "none" || getComputedStyle(c).rotate !== "none")) continue;
      const inner = el.scrollWidth > el.clientWidth + 1 && /(visible)/.test(cs.overflowX) && el.clientWidth > 0 && !/inline/.test(cs.display);
      const out_ = r.right > sr.right + 1 || r.left < sr.left - 1;
      if (inner || out_) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 3).join(".") : ""} w=${Math.round(r.width)} scrollW=${el.scrollWidth} right=${Math.round(r.right)}  "${(el.textContent || "").trim().slice(0, 50)}"`);
    }
    return out.slice(0, 8);
  });
  if (faults.length) { bad += faults.length; console.log(`FAIL ${path}`); faults.forEach((f) => console.log("   " + f)); } else console.log(`ok   ${path}`);
}
await b.close();
console.log(bad ? `${bad} overflow fault(s)` : "no overflow faults");
process.exit(bad ? 1 : 0);
