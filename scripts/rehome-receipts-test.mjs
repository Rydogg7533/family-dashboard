// Needs Node 22.18+. Offline: no disk, no network.
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { planRehome } from "./rehome-receipts.mjs";
const root = `${homedir()}/Organized/Personal/Documents`;
const rc = (o = {}) => ({ merchant: "Panda", amount: 24.78, date: "2026-10-22", card: "Wells Fargo 0848", card_confidence: "high", card_conflict: false, created_at: "2026-10-23T00:00:00Z", ...o });
const now = Date.parse("2026-10-25T12:00:00Z");
const from = `${root}/Finance/2026/Dining/2026-10-22 Panda.jpg`;
const to = `${root}/Finance/2026/Wells Fargo 0848/2026-10/2026-10-22 Panda.jpg`;
// moves to Finance/<year>/<card>/<month>/ keeping the file name
const p = planRehome([from], rc(), (x) => x === from, now);
assert.deepEqual(p, { moves: [{ from, to }], home: to });
// refuses to overwrite
assert.match(planRehome([from], rc(), () => true, now).skip, /already exists/);
// source missing
assert.match(planRehome([from], rc(), () => false, now).skip, /not at/);
// card only printed on the paper and recent: waits
assert.match(planRehome([from], rc({ card_confidence: "medium" }), () => true, now).skip, /not firm/);
// conflict waits
assert.match(planRehome([from], rc({ card_conflict: true }), () => true, now).skip, /not firm/);
// already in the right folder: keep, no move
assert.deepEqual(planRehome([to], rc(), (x) => x === to, now), { moves: [{ from: to, to, already: true }], home: to });
// several pages all move into the same folder
const a = `${root}/Vehicles/Sienna/2026/x p1.jpg`, b = `${root}/Vehicles/Sienna/2026/x p2.jpg`;
const m = planRehome([a, b], rc(), (x) => x === a || x === b, now);
assert.equal(m.moves.length, 2);
assert.ok(m.moves.every((x) => x.to.includes("/Wells Fargo 0848/2026-10/")));
// nothing recorded
assert.match(planRehome([], rc(), () => true, now).skip, /no file path/);
console.log("rehome-receipts: all checks passed");
