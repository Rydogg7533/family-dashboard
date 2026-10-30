// Statement reader: turns the text the Mac's own OCR found into the few facts the app keeps. Pure and offline: no model, no network,
// client-safe. It returns shape only: which account (last four digits), which month, the closing date, the opening and closing balance,
// the two movement totals, and whether the arithmetic ties. It never returns statement lines, merchants, or a full account number.
//
// Honest limit: it is label-based, so a bank that words its summary box differently shows up as `missing` fields and a null tie-out,
// never as a wrong number. Teach it a new wording by adding a case to scripts/statement-parse-test.mjs first.

export type StatementRead = {
  last4Candidates: string[];                 // most frequent first; the caller picks the one that matches a known account
  period: string | null;                     // "YYYY-MM"
  closingDate: string | null;                // "YYYY-MM-DD"
  opening: number | null;
  closing: number | null;
  increases: number | null;                  // bank: deposits. card: purchases + fees + interest + cash advances
  decreases: number | null;                  // bank: withdrawals. card: payments and credits
  layout: "bank" | "card" | null;
  tie: { ok: boolean; off: number } | null;  // off = closing minus what the movements predict, in dollars
  missing: string[];                         // field names, never values
};

const AMOUNT = /(-?\(?\$?\s*-?\d[\d,]*\.\d{2}\)?-?)/;
const AMOUNT_AT_START = /^(-?\(?\$?\s*-?\d[\d,]*\.\d{2}\)?-?)(?!\d)/;

export function parseMoney(token: string): number {
  const t = token.trim();
  const negative = t.startsWith("-") || t.startsWith("(") || t.endsWith(")") || t.endsWith("-") || /^\$\s*-/.test(t);
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return negative ? -n : n;
}
const round2 = (n: number) => Math.round(n * 100) / 100 + 0;   // "+ 0" turns a negative zero into 0

// The amount that follows a label on the same line, or (when the label ends its line) at the start of the next line.
function labeled(lines: string[], label: RegExp): number | null {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i]);
    if (!m) continue;
    const rest = lines[i].slice(m.index + m[0].length);
    const same = AMOUNT.exec(rest);
    if (same) return parseMoney(same[1]);
    if (/^[\s:.\-–—]*$/.test(rest)) {
      const nx = AMOUNT_AT_START.exec((lines[i + 1] ?? "").trim());
      if (nx) return parseMoney(nx[1]);
    }
  }
  return null;
}

const CLOSING = /\b(?:new|ending|closing|statement)\s+balance\b/i;
const OPENING = /\b(?:previous|beginning|opening|prior)\s+balance\b/i;
const DEPOSITS = /\b(?:total\s+)?(?:deposits|additions)(?:\s+(?:and|&)\s+other\s+(?:credits|additions))?\b|\btotal\s+credits\b/i;
const WITHDRAWALS = /\b(?:total\s+)?(?:withdrawals|subtractions)(?:\s+(?:and|&)\s+other\s+(?:debits|subtractions))?\b|\btotal\s+debits\b/i;
const PURCHASES = /\b(?:total\s+)?(?:purchases|new\s+charges)(?:\s+(?:and|&)\s+(?:other\s+)?(?:debits|charges|adjustments))?\b/i;
const FEES = /\b(?:total\s+)?fees\s+charged\b|\btotal\s+fees\b/i;
const INTEREST = /\binterest\s+charged\b|\btotal\s+interest\b/i;
const CASH = /\bcash\s+advances?\b/i;
const PAYMENTS_AND_CREDITS = /(?<!minimum\s)(?<!min\s)\b(?:total\s+)?payments?\s*(?:,|and|&|\/)\s*(?:other\s+)?credits\b/i;
const PAYMENTS = /(?<!minimum\s)(?<!min\s)\b(?:total\s+)?payments?\b(?!\s+(?:due|information|coupon|options|address))/i;
const CREDITS = /\b(?:other\s+)?credits\b(?!\s+limit)/i;

// ---------- dates ----------
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number): string | null => {
  const year = y < 100 ? 2000 + y : y;
  if (m < 1 || m > 12 || d < 1 || d > 31 || year < 1990 || year > 2100) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const NUM_DATE = String.raw`(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})`;
const WORD_DATE = String.raw`([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`;
const SEP = String.raw`\s*(?:-|–|—|to|through|thru)\s*`;
const PERIOD_LABEL = String.raw`(?:statement\s+period|billing\s+period|billing\s+cycle|statement\s+dates?|period|for\s+the\s+period)\s*:?\s*`;

const monthNum = (w: string) => MONTHS[w.slice(0, 3).toLowerCase()] ?? 0;

function endOfPeriod(flat: string): string | null {
  let m = new RegExp(PERIOD_LABEL + NUM_DATE + SEP + NUM_DATE, "i").exec(flat);
  if (m) return iso(Number(m[6]), Number(m[4]), Number(m[5]));
  m = new RegExp(PERIOD_LABEL + WORD_DATE + SEP + WORD_DATE, "i").exec(flat);
  if (m) return iso(Number(m[6]), monthNum(m[4]), Number(m[5]));
  // "October 1 - October 31, 2026": the first date has no year.
  m = new RegExp(PERIOD_LABEL + String.raw`[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?` + SEP + WORD_DATE, "i").exec(flat);
  if (m) return iso(Number(m[3]), monthNum(m[1]), Number(m[2]));
  // "October 1 - 31, 2026": one month word, two days.
  m = new RegExp(PERIOD_LABEL + String.raw`([A-Za-z]{3,9})\.?\s+\d{1,2}` + SEP + String.raw`(\d{1,2}),?\s+(\d{4})`, "i").exec(flat);
  if (m) return iso(Number(m[3]), monthNum(m[1]), Number(m[2]));
  return null;
}
function closingLabelDate(flat: string): string | null {
  const label = String.raw`(?:statement\s+)?closing\s+date|statement\s+date|closing\s+date`;
  let m = new RegExp("(?:" + label + String.raw`)\s*:?\s*` + NUM_DATE, "i").exec(flat);
  if (m) return iso(Number(m[3]), Number(m[1]), Number(m[2]));
  m = new RegExp("(?:" + label + String.raw`)\s*:?\s*` + WORD_DATE, "i").exec(flat);
  if (m) return iso(Number(m[3]), monthNum(m[1]), Number(m[2]));
  return null;
}

// ---------- the last four digits (only ever four) ----------
function lastFourCandidates(flat: string): string[] {
  const seen = new Map<string, { n: number; first: number }>();
  const add = (d: string, at: number) => { const e = seen.get(d); if (e) e.n++; else seen.set(d, { n: 1, first: at }); };
  for (const m of flat.matchAll(/\bending\s+in\s+(\d{4})\b/gi)) add(m[1], m.index ?? 0);
  for (const m of flat.matchAll(/(?:[xX*•]{2,}[\s\-.]*)+(\d{4})\b/g)) add(m[1], m.index ?? 0);
  for (const m of flat.matchAll(/\baccount\s*(?:number|no\.?|#)\s*:?\s*(\d{6,17})\b/gi)) add(m[1].slice(-4), m.index ?? 0);
  return [...seen.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).map(([d]) => d).slice(0, 3);
}

export function parseStatement(text: string): StatementRead {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const flat = lines.join(" ");
  const abs = (v: number | null) => (v === null ? null : Math.abs(v));

  const opening = labeled(lines, OPENING);
  const closing = labeled(lines, CLOSING);

  const deposits = abs(labeled(lines, DEPOSITS));
  const withdrawals = abs(labeled(lines, WITHDRAWALS));
  const purchases = abs(labeled(lines, PURCHASES));
  const combined = abs(labeled(lines, PAYMENTS_AND_CREDITS));
  const payments = combined ?? abs(labeled(lines, PAYMENTS));
  const otherCredits = combined === null ? abs(labeled(lines, CREDITS)) : null;
  const fees = abs(labeled(lines, FEES)), interest = abs(labeled(lines, INTEREST)), cash = abs(labeled(lines, CASH));

  let layout: StatementRead["layout"] = null;
  let increases: number | null = null, decreases: number | null = null;
  if (deposits !== null && withdrawals !== null) { layout = "bank"; increases = deposits; decreases = withdrawals; }
  else if (purchases !== null && payments !== null) {
    layout = "card";
    increases = round2(purchases + (fees ?? 0) + (interest ?? 0) + (cash ?? 0));
    decreases = round2(payments + (otherCredits ?? 0));
  }

  let tie: StatementRead["tie"] = null;
  if (layout && opening !== null && closing !== null && increases !== null && decreases !== null) {
    const off = round2(closing - (opening + increases - decreases));
    tie = { ok: Math.abs(off) <= 0.01, off };
  }

  const closingDate = endOfPeriod(flat) ?? closingLabelDate(flat);
  const last4Candidates = lastFourCandidates(flat);
  const period = closingDate ? closingDate.slice(0, 7) : null;

  const missing: string[] = [];
  if (!last4Candidates.length) missing.push("account_last4");
  if (!period) missing.push("period");
  if (closing === null) missing.push("closing_balance");
  if (opening === null) missing.push("opening_balance");
  if (!tie) missing.push("totals");

  return { last4Candidates, period, closingDate, opening, closing, increases, decreases, layout, tie, missing };
}

// The one line shown to the person about the arithmetic. Dollar amounts of the difference only; never a statement line.
export function tieNote(r: StatementRead): string {
  if (!r.tie) return "Totals not found, so the arithmetic was not checked.";
  if (r.tie.ok) return "Opening balance plus movements equals the closing balance.";
  return `Does not tie yet: $${Math.abs(r.tie.off).toFixed(2)} ${r.tie.off > 0 ? "above" : "below"} what the movements predict. The reader may have missed a line.`;
}
