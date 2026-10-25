import assert from "node:assert/strict";
import { normalizeVendor, vendorTokens, vendorCompatible, cents, dayGap, amountsClose, planMatches, nearCandidates, lastChance, likelyTransfer } from "./tx-match-lib.mjs";

assert.equal(normalizeVendor("AAA / California Roadside Service (Club Assist)"), "aaa california roadside service");
assert.deepEqual(vendorTokens("AMZN Mktp US*2K4AB7"), ["amazon"]);
assert.ok(vendorCompatible("AMZN Mktp US*2K4AB7", "Amazon.com"));
assert.ok(vendorCompatible("SQ *BLUE BOTTLE COFFEE", "Blue Bottle Coffee Inc"));
assert.ok(vendorCompatible("APPLE.COM/BILL", "Apple"));
assert.ok(vendorCompatible("COSTCO WHSE #0123", "Costco"));
assert.ok(!vendorCompatible("COSTCO WHSE #0123", "Smith's"));
assert.ok(!vendorCompatible("", "Costco"));
assert.ok(!vendorCompatible("PAYMENT THANK YOU", "Costco"));
assert.equal(dayGap("2026-10-10", "2026-10-13"), 3);
assert.equal(cents(242.88), 24288);
assert.ok(amountsClose(100, 80) && !amountsClose(100, 70) && amountsClose(2, 2.9));

const tx = (id, merchant, amount, date) => ({ id, merchant, amount, date });
const rc = (id, merchant, amount, date) => ({ id, merchant, amount, date });
// exact, within 3 days, vendor alias
let p = planMatches([tx("t1", "AMZN Mktp US*X", 42.5, "2026-10-12")], [rc("r1", "Amazon.com", 42.5, "2026-10-10")]);
assert.equal(p.matches.length, 1); assert.equal(p.matches[0].receipt.id, "r1");
// date too far, amount differs by a cent, vendor differs: no match
assert.equal(planMatches([tx("t1", "Costco", 42.5, "2026-10-20")], [rc("r1", "Costco", 42.5, "2026-10-10")]).matches.length, 0);
assert.equal(planMatches([tx("t1", "Costco", 42.51, "2026-10-10")], [rc("r1", "Costco", 42.5, "2026-10-10")]).matches.length, 0);
assert.equal(planMatches([tx("t1", "Costco", 42.5, "2026-10-10")], [rc("r1", "Smith's", 42.5, "2026-10-10")]).matches.length, 0);
// one receipt, two identical charges: only the closest date is linked, the other stays open
p = planMatches([tx("t1", "Costco", 9, "2026-10-10"), tx("t2", "Costco", 9, "2026-10-12")], [rc("r1", "Costco", 9, "2026-10-12")]);
assert.equal(p.matches.length, 1); assert.equal(p.matches[0].tx.id, "t2"); assert.equal(p.ambiguous, 2);
// two receipts, two charges: each gets its own
p = planMatches([tx("t1", "Costco", 9, "2026-10-10"), tx("t2", "Costco", 9, "2026-10-12")], [rc("r1", "Costco", 9, "2026-10-10"), rc("r2", "Costco", 9, "2026-10-12")]);
assert.deepEqual(p.matches.map((m) => [m.tx.id, m.receipt.id]).sort(), [["t1", "r1"], ["t2", "r2"]]);
// near: Amazon shipment, amount differs
assert.equal(nearCandidates(tx("t1", "AMZN Mktp US", 35, "2026-10-12"), [rc("r1", "Amazon.com", 42.5, "2026-10-11")]).length, 1);
assert.equal(nearCandidates(tx("t1", "AMZN Mktp US", 42.5, "2026-10-12"), [rc("r1", "Amazon.com", 42.5, "2026-10-11")]).length, 0);   // exact is not "near"
assert.equal(nearCandidates(tx("t1", "AMZN Mktp US", 5, "2026-10-12"), [rc("r1", "Amazon.com", 42.5, "2026-10-11")]).length, 0);
// last chance: same amount, other vendor name, within 7 days, in a named pool
const hits = lastChance(tx("t1", "WEIRD DESC", 19.99, "2026-10-12"), [{ name: "email sightings", rows: [{ amount: 19.99, date: "2026-10-08", label: "netflix" }, { amount: 20, date: "2026-10-08" }] }, { name: "Inbox", rows: [{ amount: 19.99, date: "2026-09-01" }] }]);
assert.deepEqual(hits, [{ pool: "email sightings", date: "2026-10-08", label: "netflix" }]);
assert.ok(likelyTransfer("Transfer", "x") && likelyTransfer("Credit Card Payment", "x") && likelyTransfer("", "ONLINE PAYMENT THANK YOU") && !likelyTransfer("Groceries", "Costco"));
console.log("tx-match-test: all checks passed");
