// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { cleanLines, effectiveCategory, vehicleLines, lineLabel } from "../src/lib/receipt-lines.ts";
const c = cleanLines([{ description: "  Kirkland   tires ", amount: 240, category: "vehicle" }, { description: "Rotisserie chicken", amount: "5", category: "grocery_food" }, { description: "", amount: 1 }, null, { description: "Gum", amount: -2, category: "candy" }]);
// A legacy id from an older read ("grocery_food") lands on the current one; an unknown one lands on "other".
assert.deepEqual(c, [{ description: "Kirkland tires", amount: 240, category: "vehicle" }, { description: "Rotisserie chicken", amount: null, category: "groceries" }, { description: "Gum", amount: null, category: "other" }]);
assert.deepEqual(cleanLines("x"), []); assert.equal(cleanLines(Array.from({ length: 40 }, (_, i) => ({ description: `l${i}` }))).length, 15);
const basket = [{ description: "Tires", amount: 240, category: "vehicle" }, { description: "Groceries", amount: 160, category: "grocery_food" }, { description: "Gum", amount: 2, category: "other" }];
assert.equal(effectiveCategory("grocery_food", basket), "mixed");
assert.equal(effectiveCategory("vehicle", [{ description: "Oil change", amount: 60, category: "vehicle" }, { description: "Wipers", amount: 20, category: "vehicle" }]), "vehicle");
assert.equal(effectiveCategory("grocery_food", [{ description: "Milk", amount: 50, category: "grocery_food" }, { description: "Pen", amount: 3, category: "other" }]), "grocery_food"); // a 5% stray line does not make it mixed
assert.equal(effectiveCategory("dining", []), "dining");
assert.equal(effectiveCategory("mixed", []), "mixed");
assert.equal(effectiveCategory("vehicle", [{ description: "A", amount: null, category: "vehicle" }, { description: "B", amount: null, category: "home" }]), "mixed"); // no amounts: counts
assert.equal(vehicleLines(basket).length, 1);
assert.equal(lineLabel(basket[0], { vendor: "Costco", amount: 412.6, date: "2026-10-20" }), "Tires, $240.00 (line on the Costco, $412.60, 2026-10-20 receipt)");
assert.equal(lineLabel({ description: "Tires", amount: null, category: "vehicle" }, {}), "Tires");
console.log("receipt-lines: all checks passed");
