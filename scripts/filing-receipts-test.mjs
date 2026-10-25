// node scripts/filing-receipts-test.mjs : pure-function checks for card/month filing and the vehicle index.
import assert from "node:assert/strict";
import { receiptHome, receiptFileName, vehicleIndexHtml, indexKey, indexLocation, HOLD_DAYS, detailsOf, monthIndexPlan, monthIndexHtml } from "./filing-agent.mjs";
const now = Date.parse("2026-10-23T12:00:00Z");
const fresh = { date: "2026-10-20", created_at: "2026-10-22T10:00:00Z", card: null };
assert.equal(receiptHome(fresh, now), null, "no card, fresh: waits");
assert.equal(receiptHome({ ...fresh, card: "Amex 1004", card_confidence: "medium" }, now), null, "card only from the receipt waits");
assert.equal(receiptHome({ ...fresh, card: "Amex 1004", card_confidence: "high", card_conflict: true }, now), null, "conflict waits");
assert.equal(receiptHome({ ...fresh, card: "Amex 1004", card_confidence: "medium", created_at: "2026-10-01T10:00:00Z" }, now), "Organized/Personal/Documents/Finance/2026/Amex 1004/2026-10/", "weak card files after the hold");
assert.equal(receiptHome({ ...fresh, card: "Amex 1004", card_confidence: "high" }, now), "Organized/Personal/Documents/Finance/2026/Amex 1004/2026-10/");
assert.equal(receiptHome({ ...fresh, created_at: "2026-10-01T10:00:00Z" }, now), "Organized/Personal/Documents/Finance/2026/Unplaced/2026-10/", `no card after ${HOLD_DAYS} days`);
assert.equal(receiptHome({ ...fresh, card: "../../etc", card_confidence: "high" }, now), "Organized/Personal/Documents/Finance/2026/etc/2026-10/", "path tricks are neutralised");
assert.equal(receiptHome({ date: null, created_at: null, card: "X" }, now), null);
assert.equal(receiptFileName("2026-10-20 AAA battery", 242.88, "Sienna"), "2026-10-20 AAA battery Sienna $242.88");
assert.equal(receiptFileName("2026-10-20 AAA Sienna battery $242.88", 242.88, "Sienna"), "2026-10-20 AAA Sienna battery $242.88", "no double add");
const html = vehicleIndexHtml("Toyota Sienna", "/h/Organized/Personal/Documents/Vehicles/Sienna", [
  { date: "2026-10-20", type: "receipt", title: "AAA <battery>", amount: 242.88, card: "Amex 1004", file: "/h/Organized/Personal/Documents/Finance/2026/Amex 1004/2026-10/a b.jpeg" },
  { date: "2026-11-02", type: "part", title: "Wiper blades", amount: 31.5, card: null, file: null, note: "waiting for its card" },
]);
assert.ok(html.includes("../../Finance/2026/Amex%201004/2026-10/a%20b.jpeg"), "relative encoded link");
assert.ok(html.includes("AAA &lt;battery&gt;") && html.indexOf("Wiper") < html.indexOf("AAA"), "escaped, newest first");
assert.ok(html.includes("waiting for its card"));
assert.equal(indexKey("vehicle", "Sienna"), indexKey("vehicle", "sienna"), "same subject whatever the case");
assert.deepEqual(indexLocation("vehicle", "Sienna"), { folder: "Organized/Personal/Documents/Vehicles/Sienna/", file: "Sienna - index.html" });
assert.deepEqual(indexLocation("trip", "Moab trip"), { folder: "Organized/Personal/Documents/Indexes/Trips and events/", file: "Moab trip - index.html" });
assert.equal(indexLocation("hobby", "Kayak").folder, "Organized/Personal/Documents/Indexes/hobby/", "unknown kinds still get a folder");
// Details (what the paper says it paid for) and the month-folder index.
assert.equal(detailsOf({ covers: "Google Workspace, medrepdesk.io", period: "Oct 2026", reference: "INV-1" }, null), "Covers: Google Workspace, medrepdesk.io · Period: Oct 2026 · Ref: INV-1");
assert.equal(detailsOf({ covers: null, period: null, reference: null }, null), "");
assert.equal(detailsOf(null, { external_ref: "amazon:112-3456789-1234567" }), "Ref: Amazon order 112-3456789-1234567");
assert.equal(detailsOf({ reference: "INV-9" }, { external_ref: "amazon:1" }), "Ref: INV-9", "the paper's reference wins");
assert.ok(html.includes("<th>Details</th>"));
const fin = "/h/Organized/Personal/Documents/Finance";
const plan = monthIndexPlan([
  { date: "2026-10-22", title: "Moapa <Paiute>", amount: 21.98, details: "Covers: park fee", file: `${fin}/2026/Mastercard 1752/2026-10/2026-10-22 Moapa.jpg` },
  { date: "2026-10-20", title: "AAA", amount: 242.88, details: "", file: `${fin}/2026/Mastercard 1752/2026-10/2026-10-20 AAA.jpeg` },
  { date: "2026-10-23", title: "GitHub", amount: 4.3, file: null },                                        // not filed: left out
  { date: "2026-10-01", title: "Elsewhere", amount: 1, file: "/h/Organized/Personal/Documents/Vehicles/Sienna/x.jpg" },   // outside Finance: left out
  { date: "2026-10-02", title: "Loose", amount: 1, file: `${fin}/loose.jpg` },                            // directly in the Finance root: left out
], fin);
assert.deepEqual([...plan.keys()], [`${fin}/2026/Mastercard 1752/2026-10`]);
const mh = monthIndexHtml(`${fin}/2026/Mastercard 1752/2026-10`, plan.get(`${fin}/2026/Mastercard 1752/2026-10`));
assert.ok(mh.indexOf("AAA") < mh.indexOf("Moapa"), "oldest first");
assert.ok(mh.includes("Moapa &lt;Paiute&gt;") && mh.includes("2026-10-22%20Moapa.jpg") && mh.includes("Covers: park fee"));
assert.ok(mh.includes("2 receipts, $264.86 in all") && mh.includes("Mastercard 1752 · 2026-10"));
console.log("filing receipts: all checks passed");
