// The catalog: one entry per distinct address, built from every browser's bookmarks plus the approved plan. Pure functions, no I/O.
import { createHash } from "node:crypto";
import { buildPlan, TREE } from "./bookmark-plan-lib.mjs";
const CONF = { high: 3, medium: 2, low: 1 };
export function normalizeUrl(u) {
  try { const x = new URL(u); x.hash = ""; x.hostname = x.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_)/i.test(k)) x.searchParams.delete(k);
    let s = x.toString(); if (x.pathname === "/" && !x.search) s = s.replace(/\/$/, ""); else s = s.replace(/\/$/, ""); return s; } catch { return String(u); }
}
export const idOf = (norm) => createHash("sha1").update(norm).digest("hex").slice(0, 12);
export function buildCatalog(bookmarks, now = new Date().toISOString()) {
  const { rows } = buildPlan(bookmarks); const by = new Map();
  for (const r of rows) {
    const norm = normalizeUrl(r.b.url); const e = by.get(norm) ?? { id: idOf(norm), url: norm, title: r.b.title, host: r.b.host, site: r.b.site, folder: null, also: [], confidence: "low", reason: "", status: "active", reviewed: false, sources: [], added: null, placements: [] };
    e.sources.push({ browser: r.b.browser, profile: r.b.profile, folder: r.b.folder, added: r.b.added });
    e.placements.push({ target: r.target, confidence: r.confidence, reason: r.reason });
    if (r.b.added && (!e.added || r.b.added < e.added)) e.added = r.b.added;
    if (r.b.title && r.b.title.length > e.title.length) e.title = r.b.title;
    by.set(norm, e);
  }
  const entries = [];
  for (const e of by.values()) {
    const best = [...e.placements].sort((a, b) => CONF[b.confidence] - CONF[a.confidence])[0];
    e.folder = best.target; e.confidence = best.confidence; e.reason = best.reason;
    // Same address filed in different places: keep the others as proposed extra placements, flagged for review (never silent).
    e.also = [...new Set(e.placements.map((p) => p.target).filter((t) => t !== e.folder && t !== "Inbox"))];
    delete e.placements; entries.push(e);
  }
  return { version: 1, made: now, tree: TREE, entries: entries.sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title)), history: [{ at: now, event: "created from the approved plan", count: entries.length }] };
}
export function verifyCatalog(cat, bookmarks) {
  const problems = []; const tree = new Set(cat.tree);
  const srcTotal = cat.entries.reduce((n, e) => n + e.sources.length, 0);
  if (srcTotal !== bookmarks.length) problems.push(`sources ${srcTotal} != bookmarks ${bookmarks.length}`);
  const ids = new Set(); for (const e of cat.entries) { if (ids.has(e.id)) problems.push(`duplicate id ${e.id}`); ids.add(e.id); if (!tree.has(e.folder)) problems.push(`folder not in tree: ${e.folder}`); for (const a of e.also) if (!tree.has(a)) problems.push(`extra placement not in tree: ${a}`); }
  const perFolder = new Map(); for (const e of cat.entries) perFolder.set(e.folder, (perFolder.get(e.folder) || 0) + 1);
  const over = [...perFolder].filter(([, n]) => n > 150).map(([f, n]) => `${f} (${n})`);
  return { problems, srcTotal, perFolder, over };
}
