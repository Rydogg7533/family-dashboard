// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { splitToFinish, ageInDays, OVERDUE_DAYS } from "../src/lib/receipts-to-finish.ts";
const now = Date.parse("2026-10-25T12:00:00Z");
const r = (id, date, card, conf, status = "expecting_charge") => ({ id, merchant: id, amount: 10, date, status, card, card_confidence: conf });
const s = splitToFinish([
  r("a", "2026-10-20", null, null),                 // no card, 5 days
  r("b", "2026-10-01", "", null),                   // blank card counts as none, 24 days (older, so first)
  r("c", "2026-10-20", "Visa 4417", "medium"),      // printed on paper, unconfirmed
  r("d", "2026-10-22", "Visa 4417", "high"),        // confirmed
  r("e", "2026-10-05", "Visa 4417", "high"),        // 20 days: overdue
  r("f", "2026-10-20", "Visa 4417", "high", "matched"), // matched: never listed
  r("g", "2026-10-20", "Visa 4417", "high", "needs_info"), // not filed yet: never listed
], now);
assert.equal(s.total, 5);
assert.deepEqual(s.noCard.map((x) => x.id), ["b", "a"]);
assert.deepEqual(s.waiting.map((x) => x.id), ["e", "c", "d"]);
assert.equal(s.waiting[0].overdue, true);
assert.equal(s.waiting.find((x) => x.id === "c").unconfirmed, true);
assert.equal(s.waiting.find((x) => x.id === "d").unconfirmed, false);
assert.equal(s.waiting.find((x) => x.id === "d").overdue, false);
assert.equal(s.noCard.every((x) => !x.overdue && !x.unconfirmed), true);
assert.equal(ageInDays("2026-10-25", now), 0);
assert.equal(ageInDays("2026-11-30", now), 0);       // future dates never go negative
assert.equal(ageInDays("garbage", now), 0);
assert.equal(OVERDUE_DAYS, 14);
assert.deepEqual(splitToFinish([], now), { noCard: [], waiting: [], total: 0 });
console.log("receipts-to-finish: all checks passed");
