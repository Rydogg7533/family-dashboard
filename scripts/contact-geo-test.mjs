import assert from "node:assert/strict";
import { usableAddress, addressKey, addressText, planGeo } from "./contact-geo.mjs";
const now = Date.parse("2026-10-25T20:00:00Z");
assert.equal(usableAddress({ street: "PO Box", city: "Orem" }), null);           // no house number
assert.equal(usableAddress({ street: "315 E Juanita", city: "", zip: "" }), null); // no city or zip
assert.ok(usableAddress({ street: "315 E Juanita", city: "Glendora", state: "CA", zip: "91741", label: "home" }));
assert.equal(addressKey({ street: "315 E. Juanita", city: "Glendora", state: "CA", zip: "91741" }), addressKey({ street: "315 e juanita", city: "GLENDORA", state: "ca", zip: "91741" }));
assert.equal(addressText({ street: "315 E Juanita", city: "Glendora", state: "CA", zip: "91741" }), "315 E Juanita, Glendora, CA 91741");
const A = { street: "315 E Juanita", city: "Glendora", state: "CA", zip: "91741", label: "home" }, B = { street: "412 W Elm St", city: "Orem", state: "UT", zip: "84057", label: "home" };
const card = (addresses, extra = {}) => ({ id: "c1", person: "p1", full_name: "Sarah Smith", last_name: "Smith", org: null, addresses, ...extra });
const row = (a, extra = {}) => ({ id: "r1", card_id: "c1", address_key: addressKey(a), status: "ok", geocoded_at: "2026-10-01T00:00:00Z", valid_until: null, name: "Sarah Smith", last_name: "Smith", org: null, ...extra });
// New card: look the address up.
let p = planGeo([card([A])], []); assert.equal(p.add.length, 1); assert.equal(p.close.length, 0);
// Unchanged: nothing to do.
p = planGeo([card([A])], [row(A)], now); assert.deepEqual([p.add.length, p.close.length, p.rename.length, p.retry.length], [0, 0, 0, 0]);
// Address changed: the old row is closed (kept), the new one is looked up.
p = planGeo([card([B])], [row(A)], now); assert.deepEqual(p.close, ["r1"]); assert.equal(p.add.length, 1); assert.equal(p.add[0].key, addressKey(B));
// A second address is added without closing the first.
p = planGeo([card([A, B])], [row(A)], now); assert.equal(p.close.length, 0); assert.equal(p.add.length, 1);
// The card is gone (or lost its addresses): its rows close.
p = planGeo([], [row(A)], now); assert.deepEqual(p.close, ["r1"]);
// Closed rows are ignored; the same address coming back is looked up again as a new row.
p = planGeo([card([A])], [row(A, { valid_until: "2026-10-10T00:00:00Z" })], now); assert.equal(p.add.length, 1); assert.equal(p.close.length, 0);
// A renamed contact updates the stored name.
p = planGeo([card([A], { full_name: "Sarah Jones", last_name: "Jones" })], [row(A)], now); assert.equal(p.rename.length, 1); assert.equal(p.rename[0].name, "Sarah Jones");
// not_found rows are retried only after 30 days.
p = planGeo([card([A])], [row(A, { status: "not_found" })], now); assert.equal(p.retry.length, 0);
p = planGeo([card([A])], [row(A, { status: "not_found", geocoded_at: "2026-09-01T00:00:00Z" })], now); assert.equal(p.retry.length, 1);
console.log("contact-geo-test ok");
