#!/usr/bin/env node
// Offline tests for scripts/subscriptions-lib.mjs. No network, no mailbox. Run: node scripts/subscriptions-test.mjs
import assert from "node:assert/strict";
import { cleanSubject, categorize, parseListUnsubscribe, isOneClick, methodOf, parseMessage, groupSenders, planWrites } from "./subscriptions-lib.mjs";

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

// ---- topics
assert.equal(cleanSubject("  Hi\u0000   there\n\tfriend\u200b "), "Hi there friend"); assert.equal(cleanSubject("x".repeat(300)).length, 120); assert.equal(cleanSubject(undefined), "");
const cat = (name, domain, ...subjects) => categorize({ name, domain, subjects });
assert.equal(cat("Smith's", "email.smiths.com", "Weekly ad: 20% off produce"), "promos");
assert.equal(cat("Gap", "gap.com", "Extra 40% off ends tonight"), "promos");
assert.equal(cat("Venmo", "venmo.com", "You paid Sam"), "account");
assert.equal(cat("Credit Karma", "creditkarma.com", "Your score changed"), "account");
assert.equal(cat("Shop", "shop.com", "Free shipping on your order"), "promos", "promo wins over orders");
assert.equal(cat("Shop", "shop.com", "Your order has shipped"), "orders");
assert.equal(cat("LinkedIn", "linkedin.com", "You appeared in 5 searches"), "social");
assert.equal(cat("Delta", "delta.com", "Fly to Hawaii"), "travel");
assert.equal(cat("Friends of Sam", "actblue.com", "Please donate before midnight"), "donations");
assert.equal(cat("Morning Brew", "morningbrew.com", "Your daily digest"), "news");
assert.equal(cat("Bob", "bobs.example", "hello"), "unclear");
assert.equal(cat("Google", "google.com", "Ryan, review your Google Account settings"), "account");
assert.equal(cat("Helius", "helius.xyz", "Updated Helius Terms of Service"), "account");
assert.equal(cat("MetaMask Team", "metamask.io", "A 20K sweepstakes just went live"), "promos");
assert.equal(cat("Cursor Team", "mail.cursor.com", "Now in Cursor: Web Layout Editor"), "news");
assert.equal(cat("Couch Critics", "mail.beehiiv.com", "Holiday films"), "news");
assert.equal(cat("Bank of X", "x.com", "Big sale on rates"), "account", "guarded wins over promos");
// subjects: 3 newest, de-duplicated, account senders keep none
const sm = (from, subj, ts) => parseMessage(msg(from, { "List-Unsubscribe": "<https://s.com/u>", Subject: subj }, ts));
const g2 = groupSenders([sm("S <s@s.com>", "Sale one", day("2026-01-01")), sm("S <s@s.com>", "Sale two", day("2026-01-02")), sm("S <s@s.com>", "sale two", day("2026-01-03")), sm("S <s@s.com>", "Sale four", day("2026-01-04")), sm("S <s@s.com>", "Sale five", day("2026-01-05"))]);
assert.deepEqual(g2.get("s@s.com").subjects, ["Sale five", "Sale four", "sale two"]);
const p2 = planWrites({ groups: g2, existing: new Map(), ...base }).inserts[0];
assert.equal(p2.category, "promos"); assert.equal(p2.recent_subjects.length, 3);
const acct = groupSenders([parseMessage(msg("Venmo <v@venmo.com>", { "List-Unsubscribe": "<https://v.com/u>", Subject: "You paid Sam $40" }, day("2026-01-01")))]);
const pa = planWrites({ groups: acct, existing: new Map(), ...base }).inserts[0];
assert.equal(pa.category, "account"); assert.deepEqual(pa.recent_subjects, [], "no subject text kept for account senders");
// rows from before topics existed get a label once, counts untouched; then are left alone
const old = new Map([["s@s.com", { id: "z", category: null, message_count: 5, last_message_ts: day("2026-01-05"), first_seen: "2026-01-01", deleted_at: null }]]);
let bf = planWrites({ groups: g2, existing: old, ...base });
assert.equal(bf.updates.length, 1); assert.equal(bf.updates[0].patch.category, "promos"); assert.ok(!("message_count" in bf.updates[0].patch) && !("last_seen" in bf.updates[0].patch));
old.get("s@s.com").category = "promos";
assert.equal(planWrites({ groups: g2, existing: old, ...base }).updates.length, 0);
old.get("s@s.com").category = "unclear";
assert.equal(planWrites({ groups: g2, existing: old, ...base }).updates[0].patch.category, "promos", "a label stored under older rules is refreshed");

console.log("PASS: subscriptions-lib (all checks)");
