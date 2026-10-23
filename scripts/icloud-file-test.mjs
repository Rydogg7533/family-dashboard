// node scripts/icloud-file-test.mjs : the sorting rules, offline.
import assert from "node:assert/strict";
import { classify } from "./icloud-file.mjs";
const now = Date.parse("2026-10-23T12:00:00Z"), day = 86400_000;
const base = { flagged: false, date: now - 10 * day, subject: "hello", address: "pal@example.com", domain: "example.com", listUnsubscribe: false, precedenceBulk: false, autoSubmitted: false };
const t = (o, expect, note) => assert.equal(classify({ ...base, ...o }, { now }).to, expect, note);
t({ flagged: true, listUnsubscribe: true }, null, "starred is never moved");
t({ listUnsubscribe: true }, "handled", "recent marketing");
t({ listUnsubscribe: true, date: now - 400 * day }, "archive", "old marketing");
t({ subject: "Your receipt from Apple" }, "money", "receipt");
t({ subject: "Your receipt from Apple", date: now - 900 * day }, "money", "old receipt stays findable");
t({ subject: "Booking reference ABC123 for your stay" }, "records", "confirmation");
t({ subject: "Invitation: team sync @ Tue" }, null, "calendar invites stay");
t({}, null, "a person, recent: left for triage");
t({ date: now - 500 * day }, "archive", "a person, old: archived");
assert.equal(classify({ ...base, listUnsubscribe: true, domain: "tiller.com", address: "hi@tiller.com" }, { now, keep: ["tiller.com"] }).to, null, "kept sender");
console.log("icloud-file: all checks passed");
