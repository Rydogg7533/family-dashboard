import assert from "node:assert/strict";
import { decide } from "./email-lib.mjs";
const e = (subject, extra = {}) => ({ folder: "inbox", subject, snippet: "", address: "auto-confirm@amazon.com", listUnsubscribe: false, precedenceBulk: false, autoSubmitted: false, ...extra });
const act = (s, x) => decide(e(s, x)).action;
// Purchases are money, so the receipt path sees them
assert.equal(act("Ordered 3 items: Automotive"), "money");
assert.equal(act("Ordered 1 item: Auto Accessories"), "money");
assert.equal(act("Amazon.com order of The Gift."), "money");
assert.equal(act("Thank you for your purchase"), "money");
assert.equal(act("Your receipt from Apple"), "money");
// Shipping and delivery are not receipts; returns are not
assert.equal(act("Shipped 1 item: Automotive"), "fyi");
assert.equal(act("Delivered 1 item: Automotive"), "fyi");
assert.notEqual(act("Return request confirmed for Door Pillar Trim Molding"), "money");
console.log("email-receipt-rules-test: ok");
// A receipt with an unsubscribe link is still a receipt; promotional wording keeps it marketing
assert.equal(act("Your receipt from Square", { listUnsubscribe: true }), "money");
assert.equal(act("Your order is confirmed", { listUnsubscribe: true, precedenceBulk: true }), "money");
assert.equal(act("Your order: 20% off ends tonight", { listUnsubscribe: true }), "archive");
assert.equal(act("Don't miss our sale", { listUnsubscribe: true }), "archive");
assert.equal(act("Weekly newsletter", { listUnsubscribe: true }), "archive");
console.log("email-receipt-rules-test (unsubscribe cases): ok");
