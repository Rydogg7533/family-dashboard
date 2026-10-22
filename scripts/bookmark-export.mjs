// Turns ~/Organized/_Bookmarks/catalog.json into a standard bookmarks HTML file that any browser can import. Read-only on the catalog; writes one NEW file; refuses to overwrite.
// Usage: node scripts/bookmark-export.mjs [--out <file>] [--wrap "StewardOS (new)"]   (default out: ~/Desktop/StewardOS-bookmarks.html)
import { readFileSync, writeFileSync, existsSync } from "node:fs"; import { homedir } from "node:os"; import { join } from "node:path";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function exportHtml(cat, wrap) {
  const root = { kids: new Map(), items: [] };
  const node = (path) => path.split(" › ").reduce((n, p) => { if (!n.kids.has(p)) n.kids.set(p, { kids: new Map(), items: [] }); return n.kids.get(p); }, root);
  for (const p of cat.tree) node(p);
  let count = 0;
  for (const e of cat.entries) { if (e.status && e.status !== "active") continue; for (const f of [e.folder, ...(e.also || [])]) { node(f).items.push(e); count++; } }
  const out = []; const pad = (d) => "    ".repeat(d);
  const walk = (n, d) => {
    for (const e of [...n.items].sort((a, b) => a.title.localeCompare(b.title))) out.push(`${pad(d)}<DT><A HREF="${esc(e.url)}"${e.added ? ` ADD_DATE="${Math.floor(Date.parse(e.added) / 1000) || ""}"` : ""}>${esc(e.title || e.host)}</A>`);
    for (const [name, k] of [...n.kids].sort((a, b) => a[0] === "Pinned" ? -1 : b[0] === "Pinned" ? 1 : a[0].localeCompare(b[0]))) { out.push(`${pad(d)}<DT><H3>${esc(name)}</H3>`, `${pad(d)}<DL><p>`); walk(k, d + 1); out.push(`${pad(d)}</DL><p>`); }
  };
  const lines = ["<!DOCTYPE NETSCAPE-Bookmark-file-1>", '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', "<TITLE>Bookmarks</TITLE>", "<H1>Bookmarks</H1>", "<DL><p>"];
  if (wrap) { lines.push(`    <DT><H3>${esc(wrap)}</H3>`, "    <DL><p>"); walk(root, 2); lines.push(...out, "    </DL><p>"); } else { walk(root, 1); lines.push(...out); }
  lines.push("</DL><p>");
  return { html: lines.join("\n") + "\n", count };
}
if (process.argv[1].endsWith("bookmark-export.mjs")) {
  const HOME = homedir(); const cat = JSON.parse(readFileSync(join(HOME, "Organized", "_Bookmarks", "catalog.json"), "utf8"));
  const file = arg("--out", join(HOME, "Desktop", "StewardOS-bookmarks.html")); const wrap = arg("--wrap", "StewardOS (new)");
  if (existsSync(file)) { console.error(`REFUSING: ${file} already exists.`); process.exit(1); }
  const { html, count } = exportHtml(cat, wrap); writeFileSync(file, html, { flag: "wx" });
  const back = readFileSync(file, "utf8"); const links = (back.match(/<A HREF=/g) || []).length;
  console.log(`${links === count ? "PASS" : "MISMATCH"} — wrote ${file}: ${links} links (${cat.entries.length} addresses + ${count - cat.entries.length} extra placements) inside one folder called "${wrap}". Nothing in any browser was changed.`);
  process.exit(links === count ? 0 : 1);
}
