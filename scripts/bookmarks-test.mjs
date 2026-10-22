#!/usr/bin/env node
// Offline tests for scripts/bookmarks-lib.mjs. Run: node scripts/bookmarks-test.mjs
import assert from "node:assert/strict";
import { hostOf, siteOf, isPlatform, parseChromium, parseSafari, parseFirefox, buildIndex, matchSender } from "./bookmarks-lib.mjs";

assert.equal(hostOf("https://www.Example.com/a?b=1"), "www.example.com"); assert.equal(hostOf("javascript:alert(1)"), null); assert.equal(hostOf("chrome://settings"), null); assert.equal(hostOf("nope"), null);
assert.equal(siteOf("mail.creditkarma.com"), "creditkarma.com"); assert.equal(siteOf("www.shop.co.uk"), "shop.co.uk"); assert.equal(siteOf("email.news.example.com.au"), "example.com.au");
assert.equal(siteOf("creditkarma.com"), "creditkarma.com"); assert.equal(siteOf("10.0.0.1"), "10.0.0.1"); assert.equal(siteOf(null), null);
assert.equal(isPlatform("substack.com"), true); assert.equal(isPlatform("creditkarma.com"), false);

const chrome = { roots: {
  bookmark_bar: { name: "Bookmarks bar", type: "folder", children: [
    { type: "url", name: "Credit Karma", url: "https://www.creditkarma.com/", date_added: "13350000000000000" },
    { type: "folder", name: "Dev", children: [{ type: "url", name: "Vercel", url: "https://vercel.com/dashboard" }, { type: "url", name: "bad", url: "chrome://flags" }] }] },
  other: { name: "Other bookmarks", type: "folder", children: [] }, synced: { name: "Mobile bookmarks", type: "folder", children: [{ type: "url", name: "Airbnb", url: "https://www.airbnb.com/" }] } } };
const c = parseChromium(chrome, "Chrome", "shvr.co");
assert.equal(c.length, 3); assert.equal(c[0].folder, "Bookmarks bar"); assert.equal(c[1].folder, "Bookmarks bar › Dev"); assert.equal(c[0].site, "creditkarma.com"); assert.match(c[0].added, /^\d{4}-\d\d-\d\d$/);

const safari = { WebBookmarkType: "WebBookmarkTypeList", Children: [
  { WebBookmarkType: "WebBookmarkTypeList", Title: "BookmarksBar", Children: [{ WebBookmarkType: "WebBookmarkTypeLeaf", URLString: "https://venmo.com", URIDictionary: { title: "Venmo" } }] },
  { WebBookmarkType: "WebBookmarkTypeList", Title: "com.apple.ReadingList", Children: [{ WebBookmarkType: "WebBookmarkTypeLeaf", URLString: "https://a.example.com/x" }, { WebBookmarkType: "WebBookmarkTypeLeaf", URLString: "https://b.example.com/y" }] }] };
const s = parseSafari(safari);
assert.equal(s.bookmarks.length, 1); assert.equal(s.bookmarks[0].folder, "Favorites"); assert.equal(s.readingList, 2, "reading list is counted, not mixed into bookmarks");

const ff = parseFirefox(
  [{ title: "Kalshi", url: "https://kalshi.com/", parent: 5, dateAdded: "1700000000000000" }, { title: "x", url: "place:sort=8", parent: 5 }],
  [{ id: 1, parent: 0, title: "" }, { id: 2, parent: 1, title: "menu" }, { id: 3, parent: 1, title: "toolbar" }, { id: 5, parent: 3, title: "Trading" }], "Firefox", "default-release");
assert.equal(ff.length, 1); assert.equal(ff[0].folder, "Bookmarks Toolbar › Trading"); assert.equal(ff[0].added, "2023-11-14");

const idx = buildIndex([...c, ...s.bookmarks, ...ff]);
assert.deepEqual(matchSender("mail.creditkarma.com", idx), { site: "creditkarma.com", status: "bookmarked", where: "Chrome (shvr.co) › Bookmarks bar" });
assert.equal(matchSender("email.venmo.com", idx).status, "bookmarked"); assert.equal(matchSender("email.venmo.com", idx).where, "Safari › Favorites");
assert.equal(matchSender("mail.cursor.com", idx).status, "missing");
assert.equal(matchSender("substack.com", idx).status, "unknown", "platform senders are never claimed as bookmarked or missing");
assert.equal(matchSender("", idx).status, "unknown");
console.log("PASS: bookmarks-lib (all checks)");
