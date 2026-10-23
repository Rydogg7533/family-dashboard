// node scripts/filing-receipts-test.mjs : pure-function checks for card/month filing and the vehicle index.
import assert from "node:assert/strict";
import { receiptHome, receiptFileName, vehicleIndexHtml, indexKey, indexLocation, HOLD_DAYS } from "./filing-agent.mjs";
const now = Date.parse("2026-10-23T12:00:00Z");
const fresh = { date: "2026-10-20", created_at: "2026-10-22T10:00:00Z", card: null };
assert.equal(receiptHome(fresh, now), null, "no card, fresh: waits");
assert.equal(receiptHome({ ...fresh, card: "Amex 1004" }, now), "Organized/Personal/Documents/Finance/2026/Amex 1004/2026-10/");
assert.equal(receiptHome({ ...fresh, created_at: "2026-10-01T10:00:00Z" }, now), "Organized/Personal/Documents/Finance/2026/Unplaced/2026-10/", `no card after ${HOLD_DAYS} days`);
assert.equal(receiptHome({ ...fresh, card: "../../etc" }, now), "Organized/Personal/Documents/Finance/2026/etc/2026-10/", "path tricks are neutralised");
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
console.log("filing receipts: all checks passed");
