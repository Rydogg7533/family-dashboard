#!/usr/bin/env node
// Offline tests for scripts/bookmark-plan-lib.mjs. Run: node scripts/bookmark-plan-test.mjs
import assert from "node:assert/strict";
import { TREE, classify, buildPlan } from "./bookmark-plan-lib.mjs";
import { siteOf, hostOf } from "./bookmarks-lib.mjs";
const bm = (browser, profile, folder, title, url) => { const host = hostOf(url); return { browser, profile, folder, title, url, host, site: siteOf(host) }; };
const t = (b) => classify(b).target;
assert.equal(new Set(TREE).size, TREE.length, "tree has no duplicate paths");
assert.ok(TREE.every((p) => p.split(" › ").length <= 4), "no path deeper than four levels");

assert.equal(t(bm("Chrome", "shvr.co", "Bookmarks Bar › MedRepDesk — Daily", "Supabase", "https://supabase.com/x")), "Ventures › MedRepDesk › Daily");
assert.equal(t(bm("Chrome", "shvr.co", "Other Bookmarks", "MedRepDesk | Supabase", "https://supabase.com/y")), "Ventures › MedRepDesk › Reference");
assert.equal(t(bm("Safari", "Default", "Veil Labs", "Mission Control", "http://localhost:3000/")), "Ventures › Veil Labs › Local dashboards");
assert.equal(t(bm("Safari", "Default", "Veil Labs", "Firecrawl", "https://firecrawl.dev/")), "Ventures › Veil Labs › AI APIs");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Case Search", "https://cityofpasadena.net/x")), "Ventures › Fairpoint › Construction › Permits & Agencies");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Vandevelde Architects", "https://vandevelde-architects.com/")), "Ventures › Fairpoint › Construction › Architects & Designers");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Inverters, Off Grid", "https://civicsolar.com/")), "Ventures › Fairpoint › Construction › Solar & Energy");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Mac download", "https://softonic.com/")), "Archive › For review", "stray in a construction folder is rerouted");
const F2 = (title, url, folder = "Favorites › Exercise & Fitness") => t(bm("Safari", "Default", folder, title, url));
assert.equal(F2("Swatch watch", "https://jomashop.com/x"), "Home & Family › Shopping");
assert.equal(F2("Equity", "https://forbes.com/x"), "Learn › Business Know-how");
assert.equal(F2("Fitness", "https://simplescience.com/x"), "Home & Family › Health & Fitness");
assert.equal(t(bm("Safari", "Default", "Favorites", "iCloud", "https://icloud.com/")), "Pinned");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Icon Search", "https://iconfinder.com/")), "Tools › Design Assets");
assert.equal(t(bm("Safari", "Default", "Favorites › Social Media", "Facebook (Fairpoint Construction & Development)", "https://facebook.com/x")), "Ventures › Fairpoint › Construction › Business Ops");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Omnifocus 1.5 cracked", "https://isohunt.com/x")), "Archive › For review");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Wood-Mode cabinetry", "https://wood-mode.com/")), "Ventures › Fairpoint › Construction › Materials & Suppliers");
assert.equal(t(bm("Safari", "Default", "Business › Little Miss Lorynn", "Paper Gift Bag", "https://alibaba.com/x")), "Ventures › Little Miss Lorynn › Sourcing › Alibaba");
assert.equal(t(bm("Safari", "Default", "Business › Little Miss Lorynn", "Instagram Bot", "https://instagetbot.com/")), "Archive › For review");
assert.equal(t(bm("Safari", "Default", "Business › Little Miss Lorynn", "MLM Startup", "https://launchsmart.com/")), "Ventures › Little Miss Lorynn › Direct Sales & MLM");
assert.equal(t(bm("Safari", "Default", "Business › Little Miss Lorynn", "eCC QuickBooks", "https://shopify.com/x")), "Tools › Web & Ecommerce");
assert.equal(t(bm("Safari", "Default", "Broadbeach Malibu Cold Calls", "Malibu Glass", "https://malibuglass.net/")), "Ventures › Fairpoint › Construction › Subcontractors");
assert.equal(t(bm("Safari", "Default", "Link Dump Folder", "Mikey's Fabric", "https://mikeysfabric.com/")), "Ventures › Little Miss Lorynn › Sourcing › Fabric");
assert.equal(t(bm("Safari", "Default", "Link Dump Folder", "Hyatt choir", "https://youtube.com/x")), "Home & Family › Music");
assert.equal(t(bm("Safari", "Default", "Link Dump Folder", "Some video", "https://youtube.com/y")), "Inbox", "a video with no topic clue is left for a human");
assert.notEqual(t(bm("Safari", "Default", "Favorites", "Koshiji", "https://yelp.com/biz/x")), "Archive › For review", "yelp outside a construction folder is not treated as a stray");
assert.equal(t(bm("Safari", "Default", "Link Dump Folder", "MLM LAW BOOK", "https://mlmconsultant.com/")), "Ventures › Little Miss Lorynn › Direct Sales & MLM");
assert.equal(t(bm("Safari", "Default", "Link Dump Folder", "Lady Skater Pattern Review", "https://deliacreates.com/")), "Ventures › Little Miss Lorynn › Patterns & Sewing");
assert.equal(t(bm("Safari", "Default", "Link Dump Folder", "Funding Rates for Crypto Futures", "https://viewbase.com/")), "Money › Crypto & Markets");
assert.equal(t(bm("Safari", "Default", "Link Dump Folder", "50 Websites Your Startup Needs", "https://inc.com/x")), "Learn › Business Know-how");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Zebra pen", "https://staples.com/x")), "Ventures › Fairpoint › Construction › Business Ops");
assert.equal(t(bm("Safari", "Default", "Business › Fairpoint Contstruction", "Corsair Vengeance 16GB", "https://amazon.com/x")), "Home & Family › Shopping");
assert.equal(t(bm("Safari", "Default", "Business › Little Miss Lorynn", "Giant Mustache Lollipop Masks", "https://melvillecandycompany.com/")), "Ventures › Little Miss Lorynn › Reference");
assert.equal(t(bm("Safari", "Default", "Personal › Financial", "Coinbase", "https://coinbase.com/")), "Money › Crypto & Markets");
assert.equal(t(bm("Firefox", "default-release-1", "Bookmarks Menu › Mozilla Firefox", "Get Help", "https://support.mozilla.org/")), "Archive › Browser defaults");
assert.equal(classify(bm("Safari", "Default", "(none)", "zzz", "https://unknown-site.example/")).confidence, "low");

// nothing lost: every bookmark gets exactly one primary target, all in the tree
const sample = [bm("Safari", "Default", "Favorites", "Wikipedia", "https://wikipedia.org/"), bm("Safari", "Default", "(none)", "x", "https://nothing.example/")];
const p = buildPlan(sample); assert.equal(p.rows.length, sample.length); assert.equal([...p.byTarget.values()].reduce((a, b) => a + b, 0), sample.length);
console.log("PASS: bookmark-plan-lib (all checks)");
