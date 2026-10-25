// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { checkAccount, tillerHealth, allowanceFor } from "../src/lib/tiller-health.ts";

const every = (from, to, step) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += step * 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
const acct = (id, dates, extra = {}) => ({ id, label: id, dates, confirmed: false, tracked: true, ...extra });
const TODAY = "2026-10-25", P = "2026-10";

// Allowance: 3x the usual gap, floor 10, cap 45, sparse accounts 30.
assert.equal(allowanceFor(every("2025-11-01", "2026-10-21", 2)), 10);        // busy: floor
assert.equal(allowanceFor(every("2025-11-01", "2026-10-21", 10)), 30);       // every 10 days: 3x
assert.equal(allowanceFor(["2025-01-01", "2026-01-01"]), 30);                // sparse
assert.equal(allowanceFor(every("2024-01-01", "2026-10-21", 40)), 45);       // capped

// Busy account, newest charge 4 days ago: good.
assert.equal(checkAccount(acct("amex", every("2025-11-01", "2026-10-21", 2)), P, TODAY).state, "good");
// Costco Citi: ends Apr 17, nothing since: gap, and the line says so.
const costcoDates = [...every("2025-10-16", "2026-04-14", 5), "2026-04-17"];
const costco = checkAccount(acct("costco", costcoDates), P, TODAY);
assert.equal(costco.state, "gap"); assert.match(costco.line, /Last charge Apr 17/); assert.match(costco.line, /nothing since/);
// Cash Management 6628: ends Dec 31 2025.
assert.equal(checkAccount(acct("c6628", every("2025-11-05", "2025-12-31", 1)), P, TODAY).state, "gap");
// Dead account but the person confirmed no activity this month: ok, not good.
assert.equal(checkAccount(acct("costco", costcoDates, { confirmed: true }), P, TODAY).state, "confirmed");
// Not carried by Tiller: skipped.
assert.equal(checkAccount(acct("wf6918", [], { tracked: false }), P, TODAY).state, "untracked");
// A hole in the middle of a closed month (June to early Aug, no charges) is a gap even though the account came back.
const hole = [...every("2026-04-01", "2026-05-28", 2), ...every("2026-08-03", "2026-09-30", 2)];
const june = checkAccount(acct("hole", hole), "2026-06", TODAY);
assert.equal(june.state, "gap"); assert.match(june.line, /No charges from/);
// ...and the same account is fine for a month it did deliver.
assert.equal(checkAccount(acct("hole", hole), "2026-09", TODAY).state, "good");
// New account that started mid-month is not penalised for the days before it existed.
assert.equal(checkAccount(acct("new", every("2026-10-18", "2026-10-24", 2)), P, TODAY).state, "good");
// No charges at all.
assert.equal(checkAccount(acct("none", []), P, TODAY).state, "gap");
// A closed past month is judged at its own end, not today: Costco was fine in March.
assert.equal(checkAccount(acct("costco", costcoDates), "2026-03", TODAY).state, "good");
// Future month: nothing to judge.
assert.equal(checkAccount(acct("amex", every("2025-11-01", "2026-10-21", 2)), "2026-12", TODAY).state, "good");

// Whole picture, today's real shape: 2 of 6 tracked accounts fail, so the gate is shut.
const accts = [acct("amex", every("2025-11-01", "2026-10-21", 2)), acct("costco", costcoDates), acct("c6591", every("2025-11-10", "2026-10-08", 7)), acct("c6628", every("2025-11-05", "2025-12-31", 1)), acct("wf0848", every("2025-11-03", "2026-10-23", 1)), acct("wf6006", every("2025-08-28", "2026-10-17", 2)), acct("wf6918", [], { tracked: false })];
const h = tillerHealth(accts, P, TODAY, ["2026-10-25T02:25:28Z"]);
assert.equal(h.total, 6); assert.equal(h.good, 4); assert.deepEqual(h.failing.map((f) => f.id), ["costco", "c6628"]); assert.equal(h.ok, false);
// Confirm the two and it opens.
const h2 = tillerHealth(accts.map((a) => (a.id === "costco" || a.id === "c6628" ? { ...a, confirmed: true } : a)), P, TODAY, ["2026-10-25T02:25:28Z"]);
assert.equal(h2.ok, true); assert.equal(h2.syncOk, true);
// Stale sync shuts the gate for the current month only.
const stale = tillerHealth(accts.map((a) => ({ ...a, confirmed: true })), P, TODAY, ["2026-10-19T02:00:00Z"]);
assert.equal(stale.ok, false); assert.match(stale.syncLine, /6 days ago/);
assert.equal(tillerHealth(accts.map((a) => ({ ...a, confirmed: true })), "2026-03", TODAY, ["2026-10-19T02:00:00Z"]).syncOk, true);
// Never synced.
assert.equal(tillerHealth(accts, P, TODAY, [null]).syncOk, false);
// No tracked accounts at all can never pass.
assert.equal(tillerHealth([acct("x", [], { tracked: false })], P, TODAY, [null]).ok, false);
console.log("tiller-health tests passed");
