// Needs Node 22.18+. Offline. Synthetic text only: no real statement is in this repo.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatement, parseMoney, tieNote } from "../src/lib/statement-parse.ts";

// --- money ---
assert.equal(parseMoney("$3,214.18"), 3214.18);
assert.equal(parseMoney("-$1,500.00"), -1500);
assert.equal(parseMoney("(12.00)"), -12);
assert.equal(parseMoney("12.50-"), -12.5);

// --- a checking statement that ties ---
const bank = `FIRST EXAMPLE BANK
Checking Account Statement
Account number: XXXXXX5521
Statement Period: 10/01/2026 - 10/31/2026
Beginning Balance $5,890.10
Deposits and Other Credits $4,200.00
Withdrawals and Other Debits $3,679.58
Ending Balance $6,410.52
Page 1 of 3`;
let r = parseStatement(bank);
assert.deepEqual(r.last4Candidates, ["5521"]);
assert.equal(r.period, "2026-10");
assert.equal(r.closingDate, "2026-10-31");
assert.equal(r.opening, 5890.1);
assert.equal(r.closing, 6410.52);
assert.equal(r.layout, "bank");
assert.deepEqual(r.tie, { ok: true, off: 0 });
assert.deepEqual(r.missing, []);
assert.match(tieNote(r), /equals the closing balance/);

// --- the same statement with withdrawals $12 lower: the movements now predict a closing balance $12 higher than the one printed ---
r = parseStatement(bank.replace("$3,679.58", "$3,667.58"));
assert.equal(r.tie.ok, false);
assert.equal(r.tie.off, -12);
assert.match(tieNote(r), /Does not tie yet: \$12\.00 below/);
// ...and $12 higher: the printed closing balance is $12 above what the movements predict.
r = parseStatement(bank.replace("$3,679.58", "$3,691.58"));
assert.equal(r.tie.off, 12);
assert.match(tieNote(r), /\$12\.00 above/);

// --- the amount on the line after its label (OCR splits boxes this way) ---
r = parseStatement("Statement Period 10/01/2026 - 10/31/2026\nAccount ending in 5521\nBeginning Balance\n$5,890.10\nTotal Deposits\n$4,200.00\nTotal Withdrawals\n-$3,679.58\nEnding Balance\n$6,410.52");
assert.equal(r.tie.ok, true);
assert.equal(r.decreases, 3679.58);                     // a withdrawal printed negative is still a decrease

// --- a card statement; "Minimum Payment Due" must not be taken for payments ---
const card = `EXAMPLE CARD SERVICES
Account ending in 1004
Billing Period 09/23/26 - 10/22/26
Minimum Payment Due $35.00
Previous Balance $1,500.00
Payments and Credits -$1,500.00
Purchases $3,150.00
Fees Charged $0.00
Interest Charged $64.18
New Balance $3,214.18`;
r = parseStatement(card);
assert.equal(r.layout, "card");
assert.equal(r.period, "2026-10");
assert.equal(r.closingDate, "2026-10-22");
assert.equal(r.decreases, 1500);
assert.equal(r.increases, 3214.18);
assert.deepEqual(r.tie, { ok: true, off: 0 });

// --- minimum payment line only: no payments found, so no tie-out and no guess ---
r = parseStatement("Account ending in 1004\nMinimum Payment Due $35.00\nPrevious Balance $100.00\nPurchases $50.00\nNew Balance $150.00");
assert.equal(r.tie, null);
assert.ok(r.missing.includes("totals"));

// --- separate payments and credits lines both count ---
r = parseStatement("Account ending in 1004\nPeriod 09/23/26 - 10/22/26\nPrevious Balance $1,000.00\nPayments $400.00\nOther Credits $100.00\nPurchases $700.00\nNew Balance $1,200.00");
assert.equal(r.decreases, 500);
assert.equal(r.tie.ok, true);

// --- date wordings ---
assert.equal(parseStatement("Statement Period October 1, 2026 through October 31, 2026").closingDate, "2026-10-31");
assert.equal(parseStatement("Statement Period: Oct 1 - Oct 31, 2026").closingDate, "2026-10-31");
assert.equal(parseStatement("Statement Period October 1 - 31, 2026").closingDate, "2026-10-31");
assert.equal(parseStatement("Statement Closing Date 10/22/26").closingDate, "2026-10-22");
assert.equal(parseStatement("Closing Date: October 22, 2026").period, "2026-10");
assert.equal(parseStatement("Statement Period 13/45/2026 - 14/99/2026").closingDate, null);   // impossible dates are not guessed

// --- the account: the most frequent masked number wins; a full number is cut to four digits and never returned whole ---
r = parseStatement("Card XXXX-XXXX-XXXX-1234\nending in 5521\nAccount ending in 5521\nPage footer XXXX5521");
assert.equal(r.last4Candidates[0], "5521");
r = parseStatement("Account Number: 000012345678901");
assert.deepEqual(r.last4Candidates, ["8901"]);
assert.ok(!JSON.stringify(r).includes("12345678901"), "a full account number must never be returned");

// --- nothing readable: everything is reported missing, nothing is invented ---
r = parseStatement("hello world");
assert.equal(r.tie, null);
assert.equal(r.period, null);
assert.deepEqual(r.missing, ["account_last4", "period", "closing_balance", "opening_balance", "totals"]);
assert.equal(parseStatement("").layout, null);
assert.equal(parseStatement(null).layout, null);

// --- the statements path never touches a model (Ryan, 2026-10-30: statements never go to an LLM) ---
const here = dirname(fileURLToPath(import.meta.url));
const FILES = [
  "../src/lib/statement-parse.ts", "../scripts/statement-agent.mjs",
  "../src/app/money/statements/page.tsx", "../src/app/money/statements/actions.ts",
  "../src/components/c/StatementUpload.tsx", "../src/components/c/StatementAssign.tsx",
  "../src/lib/data-statements.ts", "../src/app/api/statement-file/[id]/route.ts",
];
const BANNED = /api\.anthropic\.com|callModel|callModelVision|ANTHROPIC|@\/lib\/ai\b|openai|messages\.create/i;
for (const f of FILES) {
  const p = join(here, f);
  assert.ok(existsSync(p), `expected ${f} to exist`);
  assert.ok(!BANNED.test(readFileSync(p, "utf8")), `${f} must not reference a model`);
}
// ...and the Inbox holds anything that looks like a statement before its model read.
assert.match(readFileSync(join(here, "../src/app/inbox/read.ts"), "utf8"), /looksLikeStatement/);

console.log("statement-parse: all checks passed");
