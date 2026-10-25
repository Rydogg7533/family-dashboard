// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { cleanDetail, cleanDetails, detailsLine, detailsRead, looksLikeSecretNumber } from "../src/lib/receipt-details.ts";
assert.equal(cleanDetail("  Google Workspace,   medrepdesk.io, 3 seats ", "covers"), "Google Workspace, medrepdesk.io, 3 seats");
assert.equal(cleanDetail(null, "covers"), null);
assert.equal(cleanDetail("null", "covers"), null);
assert.equal(cleanDetail("N/A", "period"), null);
assert.equal(cleanDetail(42, "period"), null);
assert.equal(cleanDetail("x".repeat(300), "covers").length, 120);
// numbers that must never be kept
assert.equal(looksLikeSecretNumber("4111 1111 1111 1111"), true);
assert.equal(looksLikeSecretNumber("4111-1111-1111-1111"), true);
assert.equal(looksLikeSecretNumber("account 123456789012"), true);
assert.equal(looksLikeSecretNumber("Acct 000123456"), true);
// numbers that are fine
assert.equal(cleanDetail("INV-2026-001042", "reference"), "INV-2026-001042");
assert.equal(cleanDetail("112-3456789-1234567", "reference"), "112-3456789-1234567");   // Amazon order number
assert.equal(cleanDetail("Oct 1 to Oct 31, 2026", "period"), "Oct 1 to Oct 31, 2026");
assert.equal(cleanDetail("Policy year 2026-2027", "period"), "Policy year 2026-2027");
assert.equal(cleanDetail("Order 20261023", "reference"), "Order 20261023");
assert.deepEqual(cleanDetails({ covers: "GitHub org veil-labs, Pro", period: "monthly", reference: "4111 1111 1111 1111" }), { covers: "GitHub org veil-labs, Pro", period: "monthly", reference: null });
assert.deepEqual(cleanDetails(null), { covers: null, period: null, reference: null });
assert.equal(detailsLine({ covers: "medrepdesk.io", period: "Oct 2026", reference: null }), "Covers: medrepdesk.io · Period: Oct 2026");
assert.equal(detailsLine({ covers: null, period: null, reference: null }), "");
assert.equal(detailsLine(null), "");
assert.equal(detailsRead({ covers: null, period: null, reference: null }), true);
assert.equal(detailsRead({ covers: "x" }), false);
assert.equal(detailsRead(null), false);
console.log("receipt-details: all checks passed");
