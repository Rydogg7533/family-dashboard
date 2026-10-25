// Pure matching rules: a card/bank charge (transactions) against receipts and other evidence. No network, no files.
// Tested by tx-match-test.mjs. The vendor normalizer mirrors src/lib/receipt-match.ts (keep the two in step), plus
// processor prefixes and reference codes that appear on card statements ("SQ *", "AMZN Mktp US*2K4AB7").

const SUFFIX = /\b(inc|llc|ltd|co|corp|company|the)\b/g;
const STOP = new Set(["com", "www", "net", "org", "payment", "purchase", "online", "store", "stores", "services", "service", "card", "checkcard", "pos", "debit", "recurring", "usa", "and", "mktp", "bill", "the", "ach", "web", "inc", "llc", "ltd", "corp", "pmt", "autopay"]);
const ALIAS = { amzn: "amazon", amazoncom: "amazon", paypal: "", sq: "", tst: "", pp: "", sp: "" };

export function normalizeVendor(v) {
  return String(v ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/#\s*\d+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
}
export function vendorTokens(v) {
  const out = [];
  for (let t of normalizeVendor(v).split(" ")) {
    if (!t) continue;
    if (/\d/.test(t) && t.length >= 3) continue;           // reference codes and store numbers
    if (t in ALIAS) t = ALIAS[t];
    if (!t || t.length < 3 || STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}
// Two descriptions are compatible when they share a meaningful word, or one's letters contain the other's (min 4 letters).
export function vendorCompatible(a, b) {
  const ta = vendorTokens(a), tb = vendorTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.some((t) => tb.includes(t))) return true;
  const ja = ta.join(""), jb = tb.join("");
  return (jb.length >= 4 && ja.includes(jb)) || (ja.length >= 4 && jb.includes(ja));
}

export const cents = (n) => Math.round(Number(n) * 100);
export const dayGap = (a, b) => Math.abs(Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`)) / 86400000;
// Same tolerance as the duplicate-receipt rule: within 25% or $1, whichever is larger. Claude's inference.
export const amountsClose = (a, b) => Math.abs(a - b) <= Math.max(1, 0.25 * Math.max(a, b));

// Exact: same amount to the cent, date within `days` (card charges post late), compatible vendor. One receipt ↔ one charge:
// the closest dates are paired first. Returns { matches: [{tx, receipt, gap}], ambiguous } (ambiguous = charges that have several candidate receipts, or share one with another charge).
export function planMatches(txs, receipts, { days = 3 } = {}) {
  const cands = [], perTx = new Map(), perR = new Map();
  for (const t of txs) for (const r of receipts) {
    if (cents(t.amount) !== cents(r.amount)) continue;
    const gap = dayGap(t.date, r.date); if (gap > days) continue;
    if (!vendorCompatible(t.merchant, r.merchant)) continue;
    cands.push({ tx: t, receipt: r, gap }); perTx.set(t.id, (perTx.get(t.id) || 0) + 1); perR.set(r.id, (perR.get(r.id) || 0) + 1);
  }
  cands.sort((x, y) => x.gap - y.gap || String(x.tx.date).localeCompare(String(y.tx.date)) || String(x.tx.id).localeCompare(String(y.tx.id)) || String(x.receipt.id).localeCompare(String(y.receipt.id)));
  const usedT = new Set(), usedR = new Set(), matches = [];
  for (const c of cands) { if (usedT.has(c.tx.id) || usedR.has(c.receipt.id)) continue; usedT.add(c.tx.id); usedR.add(c.receipt.id); matches.push(c); }
  const amb = new Set(cands.filter((c) => perTx.get(c.tx.id) > 1 || perR.get(c.receipt.id) > 1).map((c) => c.tx.id));
  return { matches, ambiguous: amb.size };
}

// Near: same vendor, date close, amount close but not equal (an Amazon shipment, a tip). Never linked silently.
export function nearCandidates(tx, receipts, { days = 3 } = {}) {
  return receipts.filter((r) => cents(r.amount) !== cents(tx.amount) && dayGap(tx.date, r.date) <= days && vendorCompatible(tx.merchant, r.merchant) && amountsClose(Number(tx.amount), Number(r.amount)))
    .sort((a, b) => dayGap(tx.date, a.date) - dayGap(tx.date, b.date));
}

// Last chance: the same amount (to the cent) within `days` in any pool, whatever the vendor says.
// pools: [{ name, rows: [{ amount, date, label }] }]. Returns the hits as { pool, date, label }.
export function lastChance(tx, pools, { days = 7 } = {}) {
  const hits = [];
  for (const p of pools) for (const r of p.rows) if (r.amount != null && r.date && cents(r.amount) === cents(tx.amount) && dayGap(tx.date, r.date) <= days) hits.push({ pool: p.name, date: String(r.date).slice(0, 10), label: r.label || "" });
  return hits;
}

// Reported only, never stored: charges that are probably money moving between the household's own accounts.
export function likelyTransfer(category, merchant) {
  return /transfer|credit card payment|loan payment|payment/i.test(String(category ?? "")) || /\btransfer\b|payment thank you|autopay|online payment/i.test(String(merchant ?? ""));
}
