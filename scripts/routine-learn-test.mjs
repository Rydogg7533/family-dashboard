// Needs Node 22.18+ (imports the TypeScript module directly). Offline.
import assert from "node:assert/strict";
import { findCandidates, median } from "../src/lib/money-routine-learn.ts";

const o = (kind, day) => ({ kind, day });
assert.equal(median([5, 20, 9]), 9); assert.equal(median([]), 15); assert.equal(median([4, 8]), 4);
// one month only: nothing
assert.deepEqual(findCandidates([o("activity:email_receipts", "2026-10-03"), o("activity:email_receipts", "2026-10-24")], []), []);
// two months: a candidate, typical day = median, counts right
let c = findCandidates([o("activity:email_receipts", "2026-10-03"), o("activity:email_receipts", "2026-10-24"), o("activity:email_receipts", "2026-11-05")], []);
assert.equal(c.length, 1); assert.equal(c[0].key, "activity:email_receipts"); assert.deepEqual(c[0].months, ["2026-10", "2026-11"]); assert.equal(c[0].times, 3); assert.equal(c[0].typical_day, 5);
// unwatched kinds are ignored; a kind already covered by a seeded step is never offered; an accepted learned step is not re-offered
assert.deepEqual(findCandidates([o("activity:password_changed", "2026-10-01"), o("activity:password_changed", "2026-11-01")], []), []);
assert.deepEqual(findCandidates([o("filed:statement", "2026-10-01"), o("filed:statement", "2026-11-01")], []), []);
assert.deepEqual(findCandidates([o("filed:bill", "2026-10-01"), o("filed:bill", "2026-11-01")], ["learned:filed:bill"]), []);
// ordering: more months first, then more times
c = findCandidates([o("filed:bill", "2026-09-01"), o("filed:bill", "2026-10-01"), o("filed:bill", "2026-11-01"), o("activity:claim_opened", "2026-10-02"), o("activity:claim_opened", "2026-11-02")], []);
assert.deepEqual(c.map((x) => x.key), ["filed:bill", "activity:claim_opened"]);
// typical day never past 28
assert.equal(findCandidates([o("filed:bill", "2026-10-31"), o("filed:bill", "2026-11-30")], [])[0].typical_day, 28);
console.log("routine-learn-test: all checks passed");
