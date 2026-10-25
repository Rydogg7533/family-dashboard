// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { suggestCard, suggestionReason, SUGGEST_AFTER } from "../src/lib/paid-with.ts";
const h = (card, person, at, vendorKey = "quick quack") => ({ card, person, vendorKey, at });
const ry = [h("Visa 4417", "ryan", "2026-10-01"), h("Visa 4417", "ryan", "2026-09-01"), h("Visa 4417", "ryan", "2026-08-01")];
assert.deepEqual(suggestCard(ry, "quick quack", "ryan"), { card: "Visa 4417", count: SUGGEST_AFTER });
assert.equal(suggestCard(ry.slice(0, 2), "quick quack", "ryan"), null);                         // too little history
assert.equal(suggestCard([...ry, h("Amex 1004", "ryan", "2026-10-10")], "quick quack", "ryan"), null); // the newest breaks the run
assert.deepEqual(suggestCard([h("Amex 1004", "ryan", "2026-01-01"), ...ry], "quick quack", "ryan")?.card, "Visa 4417"); // older noise is fine
assert.equal(suggestCard(ry, "quick quack", "melissa"), null);                                    // Melissa's habits are separate
assert.equal(suggestCard(ry, "costco", "ryan"), null);
assert.equal(suggestCard([h(null, "ryan", "2026-10-01"), ...ry.slice(1)], "quick quack", "ryan"), null);
assert.equal(suggestionReason({ card: "Visa 4417", count: 3 }, "Quick Quack"), "Your last 3 Quick Quack receipts were Visa 4417");
console.log("paid-with: all checks passed");
