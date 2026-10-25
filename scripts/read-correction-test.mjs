// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { checkCorrection, noteCorrection, rebuildName, categoryLabel } from "../src/lib/read-correction.ts";
assert.deepEqual(checkCorrection("amount", "$1,086.40"), { ok: true, value: 1086.4 });
assert.deepEqual(checkCorrection("amount", "86.404"), { ok: true, value: 86.4 });
assert.equal(checkCorrection("amount", "0").ok, false);
assert.equal(checkCorrection("amount", "-5").ok, false);
assert.equal(checkCorrection("amount", "abc").ok, false);
assert.equal(checkCorrection("amount", "").ok, false);
assert.deepEqual(checkCorrection("date", "2026-10-20"), { ok: true, value: "2026-10-20" });
assert.equal(checkCorrection("date", "2026-02-31").ok, false);   // does not exist
assert.equal(checkCorrection("date", "10/20/2026").ok, false);
assert.equal(checkCorrection("date", "2031-01-01").ok, false);   // future
assert.equal(checkCorrection("date", "1999-01-01").ok, false);
assert.deepEqual(checkCorrection("vendor", "  Costco   Wholesale\n"), { ok: true, value: "Costco Wholesale" });
assert.equal(checkCorrection("vendor", "x".repeat(200)).value.length, 80);
assert.deepEqual(checkCorrection("category", "dining"), { ok: true, value: "dining" });
assert.equal(checkCorrection("category", "mixed").ok, false);    // derived, not picked
assert.equal(checkCorrection("category", "pirates").ok, false);
assert.equal(checkCorrection("order_number", "1").ok, false);    // not an editable field
assert.equal(checkCorrection("home", "/etc").ok, false);
// the first original is kept through later corrections
const c1 = noteCorrection(null, "vendor", "Costo", "Costco", "Ryan", "t1");
assert.deepEqual(c1.vendor, { original: "Costo", value: "Costco", by: "Ryan", at: "t1" });
const c2 = noteCorrection(c1, "vendor", "Costco", "Costco Wholesale", "Melissa", "t2");
assert.equal(c2.vendor.original, "Costo"); assert.equal(c2.vendor.value, "Costco Wholesale"); assert.equal(c2.vendor.by, "Melissa");
assert.equal(noteCorrection(c1, "amount", 10, 12, "R", "t").vendor.original, "Costo", "other fields untouched");
assert.equal(noteCorrection(null, "date", undefined, "2026-10-01", "R", "t").date.original, null);
assert.equal(rebuildName({ date: "2026-10-20", vendor: "Costco", item: "weekly groceries" }), "2026-10-20 Costco weekly groceries");
assert.equal(rebuildName({ date: "2026-10-20", vendor: "A/B: Co", item: null }), "2026-10-20 AB Co");
assert.equal(rebuildName({ date: null, vendor: "Costco" }), null);
assert.equal(rebuildName({ date: "2026-10-20", vendor: "" }), null);
assert.equal(categoryLabel("grocery_food"), "Groceries"); assert.equal(categoryLabel("mixed"), "Mixed"); assert.equal(categoryLabel(null), "");
console.log("read-correction: all checks passed");
