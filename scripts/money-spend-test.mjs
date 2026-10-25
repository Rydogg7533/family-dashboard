// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { categorySpend, isTransferLike, MIN_CHARGES_FOR_TYPICAL } from "../src/lib/money-spend.ts";
const now = new Date("2026-10-25T12:00:00Z");
const rows = [];
const add = (month, n, category, amount) => { for (let i = 0; i < n; i++) rows.push({ date: `${month}-${String(1 + (i % 27)).padStart(2, "0")}`, amount, category, merchant: "x" }); };
add("2026-10", 3, "Groceries", 100); add("2026-10", 2, "Dining", 50);
add("2026-09", 40, "Groceries", 10);               // 400 groceries, 40 charges: counts as a prior month
add("2026-08", 35, "Groceries", 20);               // 700
add("2026-07", 5, "Groceries", 1000);              // too few charges: ignored for "typical"
rows.push({ date: "2026-10-05", amount: 999, category: "Credit Card Payment", merchant: "x" }); // payment: ignored
rows.push({ date: "2026-10-06", amount: 500, category: "Groceries", merchant: "ONLINE PAYMENT THANK YOU" }); // payment: ignored
rows.push({ date: "2026-10-07", amount: -80, category: "Groceries", merchant: "refund" });       // refund: ignored
rows.push({ date: "2026-10-08", amount: "12.5", category: null, merchant: "mystery" });          // string amount, no category
rows.push({ date: "2026-10-09", amount: 40, category: "Groceries", status: "transfer", merchant: "x" }); // transfer: ignored
const s = categorySpend(rows, now);
assert.equal(s.priorMonths, 2);
assert.equal(s.monthLabel, "2026-10");
assert.equal(s.charges, 6);
const g = s.rows.find((r) => r.category === "Groceries"), d = s.rows.find((r) => r.category === "Dining"), u = s.rows.find((r) => r.category === "Uncategorized");
assert.equal(g.spent, 300); assert.equal(g.typical, 550);            // (400+700)/2
assert.equal(d.spent, 100); assert.equal(d.typical, 0);              // spent now, never before
assert.equal(u.spent, 12.5);
assert.equal(s.spent, 412.5);
assert.equal(s.typical, 550);                                        // prior month totals 400 and 700
assert.deepEqual(s.rows.map((r) => r.category), ["Groceries", "Dining", "Uncategorized"]);
// no earlier month with enough charges: typical is null, never a made-up number
const t = categorySpend(rows.filter((r) => r.date.startsWith("2026-10")), now);
assert.equal(t.priorMonths, 0); assert.equal(t.typical, null); assert.ok(t.rows.every((r) => r.typical === null));
// nothing at all
const e = categorySpend([], now);
assert.deepEqual([e.rows.length, e.spent, e.typical, e.charges], [0, 0, null, 0]);
// top N plus "Everything else"
const many = []; for (let i = 0; i < 10; i++) many.push({ date: "2026-10-02", amount: 10 + i, category: "C" + i });
const m = categorySpend(many, now, 7);
assert.equal(m.rows.length, 8); assert.equal(m.rows[7].category, "Everything else");
assert.equal(m.rows.reduce((n, r) => n + r.spent, 0), m.spent);
assert.ok(isTransferLike("Transfer", "x") && isTransferLike("", "ONLINE PAYMENT THANK YOU") && !isTransferLike("Groceries", "Costco"));
assert.equal(MIN_CHARGES_FOR_TYPICAL, 30);
console.log("money-spend: all checks passed");
