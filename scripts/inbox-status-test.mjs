// Needs Node 22.18+ (imports the TypeScript modules directly). Offline.
import assert from "node:assert/strict";
import { inboxStatus, isPaidWithSkipped, missingNote, docKind, countBy, READY_ANSWERS } from "../src/lib/inbox-status.ts";
import { FILE_YES, FILE_SAME } from "../src/lib/inbox-answers.ts";
assert.deepEqual(READY_ANSWERS, [FILE_YES, FILE_SAME]);
// "Skipped": only an open question skipped with nothing chosen.
assert.equal(isPaidWithSkipped({ read_result: { paid_with: { skipped: true } } }), true);
assert.equal(isPaidWithSkipped({ read_result: { paid_with: { value: "Amex 1008" } } }), false);
assert.equal(isPaidWithSkipped({ read_result: { paid_with: { skipped: true, value: "Amex 1008" } } }), false);
assert.equal(isPaidWithSkipped({ read_result: {} }), false);
assert.equal(isPaidWithSkipped({ read_result: null }), false);   // keep in step with the real answers

const item = (o) => ({ kind: "file", file_path: "x", options: [], missing: "", read_result: null, ...o });
assert.equal(inboxStatus(item({ options: [FILE_YES, "Not quite"] })), "needs_answer");
assert.equal(inboxStatus(item({ options: [FILE_SAME, "Different purchase, file it"] })), "needs_answer");
assert.equal(inboxStatus(item({ options: ["Receipt", "Bill", "Statement"] })), "missing_info");          // "what is this?"
assert.equal(inboxStatus(item({ options: ["Sienna", "Something else"], missing: "Which vehicle is it for?" })), "missing_info");
assert.equal(inboxStatus(item({ kind: "decide", file_path: null, options: ["Personal", "SHVR"] })), "needs_answer");
assert.equal(inboxStatus(item({ kind: "identify", file_path: null, options: ["Child 1"], missing: "Which child is this form about?" })), "missing_info");

assert.equal(missingNote({ missing: "Which vehicle is it for?", read_result: null }), "vehicle");
assert.equal(missingNote({ missing: "x. Which account is it for?", read_result: null }), "account");
assert.equal(missingNote({ missing: "I am not sure; what is this?", read_result: null }), "what it is");
assert.equal(missingNote({ missing: "I could not read this", read_result: { error: "timeout" } }), "could not read it");
assert.equal(missingNote({ missing: "Which child is this form about?", read_result: null }), "who it is for");
assert.equal(missingNote({ missing: "Is it a bill?", read_result: null }), "an answer");

assert.equal(docKind({ read_result: { kind: "receipt" } }), "Receipts");
assert.equal(docKind({ read_result: { kind: "bill" } }), "Bills");
assert.equal(docKind({ read_result: { kind: "statement" } }), "Statements");
assert.equal(docKind({ read_result: { kind: "receipt", order_number: "111-2223334-5556667" } }), "Amazon");
assert.equal(docKind({ read_result: null }), "Other");
assert.equal(docKind({ read_result: { kind: "form" } }), "Other");
assert.deepEqual(countBy(["a", "b", "a"], (x) => x), { a: 2, b: 1 });
console.log("inbox-status: all checks passed");
import { decidedOutcome } from "../src/lib/inbox-status.ts";
assert.equal(decidedOutcome({ receipt_id: "a", duplicate_of: "a" }, "x"), "Attached to a receipt already filed");
assert.equal(decidedOutcome({ receipt_id: "a" }, "2016 Tahoe"), "Filed as a receipt, expecting a charge");
assert.equal(decidedOutcome({ statement_id: "s" }, null), "Statement filed");
assert.equal(decidedOutcome(null, "Personal"), "Answered: Personal");
assert.equal(decidedOutcome(null, null), "Resolved");
console.log("decidedOutcome: all checks passed");
import { vehicleFor } from "../src/lib/match-vehicle.ts";
const V = [{ id: "t", name: "2016 Chevrolet Tahoe", short: "Tahoe", make: "Chevrolet", model: "Tahoe", year: 2016, details: null }, { id: "s", name: "2018 Toyota Sienna", short: "Sienna", make: "Toyota", model: "Sienna", year: 2018, details: null }];
assert.equal(vehicleFor("car implied by car wash service", "2016 Chevrolet Tahoe", V).id, "t");   // the hint fails, the tapped answer wins
assert.equal(vehicleFor("2018 Toyota Sienna", "Yes, file it", V).id, "s");                          // the paper names it; a plain Yes keeps it
assert.equal(vehicleFor(null, "Yes, file it", V), null);                                            // nothing names a vehicle: the filer must ask
assert.equal(vehicleFor(null, "Not a vehicle receipt", V), null);
assert.equal(vehicleFor("car", "the Tahoe or the Sienna", V), null);                                 // two fit: ask
console.log("vehicleFor: all checks passed");
