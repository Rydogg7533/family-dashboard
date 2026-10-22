#!/usr/bin/env node
// Offline tests for scripts/subscriptions-lib.mjs. No network, no mailbox. Run: node scripts/subscriptions-test.mjs
import assert from "node:assert/strict";
import { parseListUnsubscribe, isOneClick, methodOf, parseMessage, groupSenders, planWrites } from "./subscriptions-lib.mjs";

const day = (d) => Date.parse(`${d}T12:00:00Z`);
const msg = (from, headers, ts) => ({ internalDate: String(ts), payload: { headers: [{ name: "From", value: from }, ...Object.entries(headers).map(([name, value]) => ({ name, value }))] } });

// header parsing
assert.deepEqual(parseListUnsubscribe("<https://a.com/u?x=1>, <mailto:u@a.com?subject=unsub>"), { http: "https://a.com/u?x=1", mailto: "mailto:u@a.com?subject=unsub" });
assert.deepEqual(parseListUnsubscribe("<mailto:u@a.com>"), { http: null, mailto: "mailto:u@a.com" });
assert.deepEqual(parseListUnsubscribe("<http://a.com/plain>"), { http: null, mailto: null }, "plain http is refused");
assert.equal(isOneClick("List-Unsubscribe=One-Click", "https://a.com/u"), true);
assert.equal(isOneClick("List-Unsubscribe=One-Click", null), false, "one-click needs an https link");
assert.equal(isOneClick(undefined, "https://a.com/u"), false);
assert.equal(methodOf({ http: "h", mailto: "m", oneClick: true }), "one_click");
assert.equal(methodOf({ http: "h", mailto: "m", oneClick: false }), "link");
assert.equal(methodOf({ http: null, mailto: "m", oneClick: false }), "mailto");

// a message without List-Unsubscribe is not a subscription
assert.equal(parseMessage(msg("Bob <bob@x.com>", {}, day("2026-01-01"))), null);
const one = parseMessage(msg('"Shop Co" <News@Shop.com>', { "List-Unsubscribe": "<https://shop.com/u/1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "List-Id": "Shop news <news.shop.com>" }, day("2026-03-01")));
assert.equal(one.address, "news@shop.com"); assert.equal(one.name, "Shop Co"); assert.equal(one.listId, "news.shop.com"); assert.equal(one.oneClick, true);

// grouping uses the NEWEST message's link
const recs = [
  parseMessage(msg("Shop <n@shop.com>", { "List-Unsubscribe": "<https://shop.com/u/old>" }, day("2026-01-01"))),
  parseMessage(msg("Shop <n@shop.com>", { "List-Unsubscribe": "<https://shop.com/u/new>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, day("2026-02-01"))),
  parseMessage(msg("Mag <m@mag.com>", { "List-Unsubscribe": "<mailto:u@mag.com>" }, day("2026-02-02"))),
];
const groups = groupSenders(recs);
assert.equal(groups.size, 2);
assert.equal(groups.get("n@shop.com").http, "https://shop.com/u/new");
assert.equal(groups.get("n@shop.com").method, "one_click");
assert.equal(groups.get("m@mag.com").method, "mailto");

// first run: inserts, counts and dates
const base = { person: "p1", mailbox: "r@gmail.com", now: "2026-10-22T00:00:00Z" };
let plan = planWrites({ groups, existing: new Map(), ...base });
assert.equal(plan.inserts.length, 2); assert.equal(plan.updates.length, 0);
const shop = plan.inserts.find((r) => r.sender_key === "n@shop.com");
assert.equal(shop.message_count, 2); assert.equal(shop.first_seen, "2026-01-01"); assert.equal(shop.last_seen, "2026-02-01"); assert.equal(shop.last_message_ts, day("2026-02-01"));
assert.ok(!("status" in shop) && !("requested_at" in shop), "inserts never set status fields");

// second run over the SAME messages counts nothing twice
const existing = new Map([["n@shop.com", { id: "a", message_count: 2, last_message_ts: day("2026-02-01"), first_seen: "2026-01-01", deleted_at: null, completed_at: null }]]);
plan = planWrites({ groups: groupSenders(recs.slice(0, 2)), existing, ...base });
assert.equal(plan.inserts.length, 0); assert.equal(plan.updates.length, 0, "overlapping scan adds nothing");

// a newer message is added once, and never touches status
const newer = [...recs.slice(0, 2), parseMessage(msg("Shop <n@shop.com>", { "List-Unsubscribe": "<https://shop.com/u/3>" }, day("2026-03-05")))];
plan = planWrites({ groups: groupSenders(newer), existing, ...base });
assert.equal(plan.updates.length, 1); assert.equal(plan.updates[0].patch.message_count, 3); assert.equal(plan.updates[0].patch.last_seen, "2026-03-05");
assert.ok(!("status" in plan.updates[0].patch) && !("status_note" in plan.updates[0].patch) && !("completed_at" in plan.updates[0].patch));

// verification loop: mail after a completed unsubscribe is counted
const done = new Map([["n@shop.com", { id: "a", message_count: 2, last_message_ts: day("2026-02-01"), first_seen: "2026-01-01", deleted_at: null, completed_at: "2026-02-10T00:00:00Z", messages_since_unsub: 0 }]]);
plan = planWrites({ groups: groupSenders(newer), existing: done, ...base });
assert.equal(plan.updates[0].patch.messages_since_unsub, 1);

// a removed row stays removed
const gone = new Map([["n@shop.com", { id: "a", message_count: 2, last_message_ts: 0, deleted_at: "2026-02-01T00:00:00Z" }]]);
assert.equal(planWrites({ groups: groupSenders(newer), existing: gone, ...base }).updates.length, 0);

console.log("PASS: subscriptions-lib (all checks)");
