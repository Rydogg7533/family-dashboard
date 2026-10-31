// The statement month rule and the checks that hold a statement back. Fixtures are synthetic: file-name patterns and dates only, no real balances or numbers.
import { batchSignature, periodFromClosing, dateFromFileName, resolvePeriod, checkStatements, statementQuestion, sharedLast4 } from "../src/lib/statement-checks.ts";
import { resolveAccount, matchAccount, whyNoMatch, conflictNote } from "../src/lib/statement-match.ts";
let bad = 0;
const eq = (n, a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) { bad++; console.log(`FAIL ${n}: got ${x}, want ${y}`); } };

// The month most of the cycle falls in = month of (closing - 15 days).
for (const [closing, want] of [["2026-08-07", "2026-07"], ["2026-09-08", "2026-08"], ["2026-10-07", "2026-09"], ["2026-08-10", "2026-07"], ["2026-09-09", "2026-08"], ["2026-10-09", "2026-09"],
  ["2026-07-31", "2026-07"], ["2026-08-31", "2026-08"], ["2026-09-30", "2026-09"], ["2026-09-15", "2026-08"], ["2026-09-16", "2026-09"], ["2027-01-05", "2026-12"], ["2026-03-01", "2026-02"]]) eq(`period ${closing}`, periodFromClosing(closing), want);
eq("not a date", periodFromClosing("2026-02-30"), null);
eq("garbage", periodFromClosing("soon"), null);

// MMDDYY in the file name.
eq("file date", dateFromFileName(" 4230 - 090826 WellsFargo.pdf.pdf"), "2026-09-08");
eq("with folders", dateFromFileName("u/2026/x/ab-4230 - 100726 WellsFargo.pdf"), "2026-10-07");
eq("four digits only", dateFromFileName("4230.pdf"), null);
eq("not a date", dateFromFileName("abc - 123456 x.pdf"), null);
eq("hex run ignored", dateFromFileName("a090826b.pdf"), null);

// Period resolution: page date first, then the file name; the reader's month alone is only a guess.
eq("page date", resolvePeriod({ closing_date: "2026-09-08", statement_period: "2026-09" }, "x").period, "2026-08");
eq("page wins over reader month", resolvePeriod({ closing_date: "2026-10-07", statement_period: "2026-09" }, "4230 - 100726.pdf").basis, "closing date");
eq("file name when the page has none", resolvePeriod({}, "4230 - 080726 WellsFargo.pdf").period, "2026-07");
eq("reader guess only", resolvePeriod({ statement_period: "2026-09" }, "scan.pdf").basis, "reader's guess");
eq("nothing", resolvePeriod({}, "scan.pdf").basis, "none");

// ---- the checks, on the pattern of the 15 ----
const it = (id, acct, closing, over = {}) => { const r = resolvePeriod({ closing_date: closing }, over.file ?? ""); return { id, acct, label: acct, period: r.period, closing: r.closing, fileDate: over.fileDate ?? null, basis: r.basis, conflict: null, name: id, ...over }; };
const today = "2026-10-30";
// The Everyday Checking case: three statements, closing Aug 7, Sep 8, Oct 7. One month each, no duplicate.
let r = checkStatements([it("a", "chk", "2026-08-07"), it("b", "chk", "2026-09-08"), it("c", "chk", "2026-10-07")], [], today);
eq("three clean", ["a", "b", "c"].map((k) => r.byItem[k].blocks.length), [0, 0, 0]);
eq("no gaps", r.gaps, {});
// Two statements for the same month block both.
r = checkStatements([it("a", "chk", "2026-09-08"), it("b", "chk", "2026-09-10")], [], today);
eq("dup blocks both", [r.byItem.a.blocks.length, r.byItem.b.blocks.length], [1, 1]);
// Already filed month blocks the waiting one, never the filed one.
r = checkStatements([it("a", "chk", "2026-09-08")], [{ acct: "chk", period: "2026-08", closing: "2026-09-08", inboxId: "z", name: "2026-08 chk statement" }], today);
eq("filed month blocks", r.byItem.a.blocks.length, 1);
r = checkStatements([it("a", "chk", "2026-09-08")], [{ acct: "chk", period: "2026-08", closing: "2026-09-08", inboxId: "a", name: "itself" }], today);
eq("its own filed row does not block", r.byItem.a.blocks.length, 0);
// Another account with the same month is fine.
r = checkStatements([it("a", "chk", "2026-09-08"), it("b", "sav", "2026-09-08")], [], today);
eq("different accounts fine", [r.byItem.a.blocks.length, r.byItem.b.blocks.length], [0, 0]);
// Page and file name disagree.
r = checkStatements([it("a", "chk", "2026-09-08", { fileDate: "2026-08-09" })], [], today);
eq("date disagreement blocks", r.byItem.a.blocks.length, 1);
// Implausible date.
r = checkStatements([it("a", "chk", "2031-09-08")], [], today);
eq("far future blocks", r.byItem.a.blocks.length, 1);
r = checkStatements([it("a", "chk", "2009-09-08")], [], today);
eq("ancient blocks", r.byItem.a.blocks.length, 1);
// No closing date, or only the reader's month: blocked.
r = checkStatements([it("a", "chk", null, { file: "scan.pdf" })], [], today);
eq("no date blocks", r.byItem.a.blocks.length, 1);
r = checkStatements([{ ...it("a", "chk", null), period: "2026-09", basis: "reader's guess" }], [], today);
eq("reader guess blocks", r.byItem.a.blocks.length, 1);
// Account conflict carried in.
r = checkStatements([{ ...it("a", "chk", "2026-09-08"), conflict: "The page shows ····1111, but the file name points to ····2222." }], [], today);
eq("account conflict blocks", r.byItem.a.blocks.length, 1);
// An unmatched item is never blocked here (it is asking which account).
r = checkStatements([it("a", null, "2026-09-08"), it("b", null, "2026-09-09")], [], today);
eq("unmatched not checked", [r.byItem.a.blocks.length, r.byItem.b.blocks.length], [0, 0]);
// Cycle length warns, does not block.
r = checkStatements([it("a", "chk", "2026-07-07"), it("b", "chk", "2026-09-30")], [], today);
eq("long gap warns", [r.byItem.a.warns.length > 0, r.byItem.b.warns.length > 0, r.byItem.a.blocks.length], [true, true, 0]);
r = checkStatements([it("a", "chk", "2026-07-31"), it("b", "chk", "2026-08-31"), it("c", "chk", "2026-09-30")], [], today);
eq("month-end closers: no warns", [r.byItem.a.warns.length, r.byItem.b.warns.length, r.byItem.c.warns.length], [0, 0, 0]);
// Missing month.
r = checkStatements([it("a", "chk", "2026-07-31"), it("c", "chk", "2026-09-30")], [], today);
eq("missing August", r.gaps, { chk: ["2026-08"] });

// The question: a clean card asks "File it?", a held one says why and offers "File it anyway".
const t = { label: "Wells Fargo ····4230", period: "2026-08", closing: "2026-09-08", balance: null, via: "file name" };
eq("clean question", statementQuestion(t, { blocks: [], warns: [] }).options, ["Yes, file it", "Not quite"]);
const held = statementQuestion(t, { blocks: ["Another 2026-08 statement for this account is waiting (x)."], warns: [] });
eq("held options", held.options, ["File it anyway", "Not quite"]);
eq("held says why", held.missing.startsWith("Not filed automatically: Another 2026-08"), true);
eq("shows the closing date", held.missing.includes("closes Sep 8"), true);
eq("says matched by file name", held.missing.includes("Matched by the file name."), true);

// ---- accounts: never a coin toss ----
const A = (id, last4, inst = id) => ({ id, institution: inst, last4, retired_at: null });
const accts = [A("chk-4230", "4230"), A("sav-5761", "5761"), A("bank1-9999", "9999", "Bank One"), A("bank2-9999", "9999", "Bank Two")];
eq("two accounts, same last four: no pick", matchAccount(accts, "9999"), null);
eq("two accounts, same last four: says so", whyNoMatch(accts, "9999", "scan.pdf").includes("more than one of your accounts"), true);
{ const x = resolveAccount(accts, "4230", "5761 - 090826 x.pdf"); eq("page and file name disagree", [x.acct.id, x.conflict?.id, conflictNote(x.acct, x.conflict)], ["chk-4230", "sav-5761", "The page shows ····4230, but the file name points to ····5761."]); }
eq("page and file name agree", resolveAccount(accts, "4230", "4230 - 090826 x.pdf")?.conflict ?? null, null);
eq("shared warning on add", sharedLast4(accts, "9999", "new")?.includes("Bank One"), true);
eq("no warning for a unique last four", sharedLast4(accts, "1234", "new"), null);
eq("editing itself is not a clash", sharedLast4(accts, "4230", "chk-4230"), null);

// The approved list and the server's list compare as one string, whatever the order.
eq("signature ignores order", batchSignature([["b", "2026-08"], ["a", "2026-07"]]), batchSignature([["a", "2026-07"], ["b", "2026-08"]]));
eq("signature sees a moved month", batchSignature([["a", "2026-07"]]) === batchSignature([["a", "2026-08"]]), false);
eq("signature sees a dropped item", batchSignature([["a", "2026-07"], ["a", "2026-08"]]) === batchSignature([["a", "2026-07"]]), false);

if (bad) { console.log(`${bad} failed`); process.exit(1); }
console.log("statement checks: all passed");
