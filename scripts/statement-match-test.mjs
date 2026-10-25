// Needs Node 22.18+ (imports the TypeScript module directly). Offline.
import assert from "node:assert/strict";
import { matchAccount, accountFromAnswer, statementPeriod, statementName, statementHome, accountLabel } from "../src/lib/statement-match.ts";
const A = [{ id: "everyday-checking-0848", institution: "Wells Fargo", last4: "0848" }, { id: "old-1111", institution: "Old Bank", last4: "1111", retired_at: "2026-01-01" }];
assert.equal(matchAccount(A, "0848").id, "everyday-checking-0848");
assert.equal(matchAccount(A, "xxxx-0848").id, "everyday-checking-0848");
assert.equal(matchAccount(A, "1111"), null);       // retired accounts never match
assert.equal(matchAccount(A, null), null); assert.equal(matchAccount(A, "84"), null);
assert.equal(accountFromAnswer(A, "Wells Fargo ····0848").id, "everyday-checking-0848");
assert.equal(accountFromAnswer(A, "Something else"), null);
assert.equal(statementPeriod({ statement_period: "2026-09" }), "2026-09");
assert.equal(statementPeriod({ closing_date: "2026-09-28" }), "2026-09");
assert.equal(statementPeriod({ date: "2026-10-02" }), "2026-10");
assert.equal(statementPeriod({}), null);
assert.equal(statementName("2026-09", A[0]), "2026-09 Wells Fargo ····0848 statement");
assert.equal(statementHome("2026-09", A[0]), "Organized/Personal/Documents/Finance/2026/Statements/everyday-checking-0848/");
assert.equal(accountLabel(A[0]), "Wells Fargo ····0848");
console.log("statement-match-test: all checks passed");
