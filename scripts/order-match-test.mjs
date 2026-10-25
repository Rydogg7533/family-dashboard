// Needs Node 22.18+ (it imports the TypeScript helper directly). Offline: no network, no database.
import assert from "node:assert/strict";
import { extractOrderNumber, amountsMatch, findOrderReceipt } from "../src/lib/receipt-match.ts";

assert.equal(extractOrderNumber("113-6359920-1869836"), "113-6359920-1869836");
assert.equal(extractOrderNumber("Order #113-6359920-1869836 placed"), "113-6359920-1869836");
assert.equal(extractOrderNumber("1136359920"), null);
assert.equal(extractOrderNumber("11-6359920-1869836"), null);
assert.equal(extractOrderNumber(null), null);
assert.equal(extractOrderNumber(undefined), null);
assert.ok(amountsMatch(118.39, 118.39) && amountsMatch(118.39, 118.3900001) && !amountsMatch(118.39, 118.4));

// findOrderReceipt with a stand-in database: finds by external_ref, follows a retired row to the kept one, null when absent.
const rows = [
  { id: "a", merchant: "Amazon", amount: 10, external_ref: "amazon:111-1111111-1111111", duplicate_of: null },
  { id: "b", merchant: "Amazon", amount: 20, external_ref: "amazon:222-2222222-2222222", duplicate_of: "c" },
  { id: "c", merchant: "Amazon.com", amount: 20, external_ref: null, duplicate_of: null },
];
const sb = { from() { const f = {}; const q = { select: () => q, eq: (k, v) => { f[k] = v; return q; }, limit: () => q, maybeSingle: async () => ({ data: rows.find((r) => r.id === f.id) ?? null }), then: (ok) => ok({ data: rows.filter((r) => r.external_ref === f.external_ref) }) }; return q; } };
assert.equal((await findOrderReceipt(sb, "111-1111111-1111111")).id, "a");
assert.equal((await findOrderReceipt(sb, "222-2222222-2222222")).id, "c");
assert.equal(await findOrderReceipt(sb, "333-3333333-3333333"), null);
console.log("order-match-test: all checks passed");
