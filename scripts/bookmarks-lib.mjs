// Helpers for scripts/bookmark-agent.mjs. No network, no browser writes. Pure parsing so it can be tested offline.
// A bookmark record: { browser, profile, folder, title, url, host, site, added }  (folder is a "A › B" path; added is an ISO date or null)

// Second-level suffixes where the "site" is three labels (shop.co.uk -> shop.co.uk, not co.uk).
const SLD = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "co.in", "com.br", "com.mx", "co.za", "com.sg", "com.hk", "co.kr"]);
export function hostOf(url) { try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/\.$/, "") : null; } catch { return null; } }
export function siteOf(host) {
  if (!host) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return host;
  const p = host.replace(/^www\./, "").split(".");
  if (p.length <= 2) return p.join(".");
  const last2 = p.slice(-2).join(".");
  return p.slice(SLD.has(last2) ? -3 : -2).join(".");
}
// Newsletter and mail platforms: one domain hosts thousands of unrelated publications, so a bookmark on the platform says nothing about THIS sender.
export const PLATFORMS = new Set(["substack.com", "beehiiv.com", "mailchimp.com", "list-manage.com", "convertkit.com", "kit.com", "ghost.io", "medium.com", "sendgrid.net", "mailgun.org", "constantcontact.com", "campaign-archive.com", "hubspotemail.net", "klaviyomail.com", "sparkpostmail.com", "amazonses.com", "bounce.imgur.com", "linkedin.com", "facebookmail.com", "google.com", "youtube.com"]);
export const isPlatform = (site) => PLATFORMS.has(site);

const rec = (browser, profile, folder, title, url, added) => { const host = hostOf(url); return host ? { browser, profile, folder, title: String(title || "").slice(0, 200), url: String(url), host, site: siteOf(host), added: added || null } : null; };

// Chrome, Edge, Brave, Vivaldi: the Bookmarks JSON. Dates are microseconds since 1601-01-01.
const chromeDate = (v) => { const n = Number(v); if (!n) return null; const ms = n / 1000 - 11644473600000; return ms > 0 ? new Date(ms).toISOString().slice(0, 10) : null; };
export function parseChromium(json, browser, profile) {
  const out = [];
  const walk = (node, path) => {
    if (node.type === "url") { const r = rec(browser, profile, path.join(" › "), node.name, node.url, chromeDate(node.date_added)); if (r) out.push(r); }
    else for (const c of node.children || []) walk(c, node.name && node.type === "folder" ? [...path, node.name] : path);
  };
  for (const [k, root] of Object.entries(json.roots || {})) if (root && typeof root === "object" && root.children) walk(root, []);
  return out;
}

// Safari: Bookmarks.plist converted with `plutil -convert json`. The Reading List is kept apart from bookmarks.
export function parseSafari(json, browser = "Safari", profile = "Default") {
  const out = []; let readingList = 0;
  const walk = (node, path) => {
    if (node.WebBookmarkType === "WebBookmarkTypeLeaf") { const r = rec(browser, profile, path.join(" › "), node.URIDictionary?.title || node.Title, node.URLString, null); if (r) out.push(r); }
    else if (node.WebBookmarkType === "WebBookmarkTypeList") {
      if (node.Title === "com.apple.ReadingList") { readingList += (node.Children || []).length; return; }
      const name = node.Title === "BookmarksBar" ? "Favorites" : node.Title === "BookmarksMenu" ? "Bookmarks Menu" : node.Title;
      for (const c of node.Children || []) walk(c, name ? [...path, name] : path);
    }
  };
  walk(json, []);
  return { bookmarks: out, readingList };
}

// Firefox: rows from moz_bookmarks joined to moz_places (urls) plus the folder rows (type 2). Firefox dates are microseconds since 1970.
export function parseFirefox(urlRows, folderRows, browser, profile) {
  const folders = new Map(folderRows.map((f) => [Number(f.id), f]));
  const pathOf = (id) => { const p = []; let cur = folders.get(Number(id)); let guard = 0; while (cur && guard++ < 20) { if (cur.title && Number(cur.parent) !== 0) p.unshift(cur.title); cur = folders.get(Number(cur.parent)); } return p.join(" › "); };
  const names = { menu: "Bookmarks Menu", toolbar: "Bookmarks Toolbar", unfiled: "Other Bookmarks", mobile: "Mobile Bookmarks" };
  return urlRows.map((r) => { const folder = pathOf(r.parent).split(" › ").map((x, i) => (i === 0 && names[x] ? names[x] : x)).join(" › "); return rec(browser, profile, folder, r.title, r.url, r.dateAdded ? new Date(Number(r.dateAdded) / 1000).toISOString().slice(0, 10) : null); }).filter(Boolean);
}

// Which of a sender's sites are already bookmarked? index: Map(site -> [{browser, profile, folder}])
export function buildIndex(bookmarks) {
  const idx = new Map();
  for (const b of bookmarks) { if (!idx.has(b.site)) idx.set(b.site, []); idx.get(b.site).push({ browser: b.browser, profile: b.profile, folder: b.folder }); }
  return idx;
}
// Returns { site, status: 'bookmarked'|'missing'|'unknown', where }. Platform senders are 'unknown' (we cannot tell which publication a bookmark belongs to).
export function matchSender(domain, index) {
  const site = siteOf(String(domain || "").toLowerCase());
  if (!site) return { site: null, status: "unknown", where: null };
  if (isPlatform(site)) return { site, status: "unknown", where: null };
  const hits = index.get(site);
  if (!hits?.length) return { site, status: "missing", where: null };
  const h = hits[0];
  return { site, status: "bookmarked", where: `${h.browser}${h.profile && h.profile !== "Default" ? ` (${h.profile})` : ""}${h.folder ? ` › ${h.folder}` : ""}`.slice(0, 200) };
}
