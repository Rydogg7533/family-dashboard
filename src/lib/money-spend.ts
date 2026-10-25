// Spending by category from the real transactions ledger (client-safe, pure).
// Spending = positive amounts that are not transfers or card/loan payments. "Typical" = the average of the last
// (up to) three earlier months that have enough charges to mean something; null when there is no such month.
export type SpendRow = { amount: number | string; date: string; category?: string | null; status?: string | null; merchant?: string | null };
export type CatRow = { category: string; spent: number; typical: number | null };
export type SpendSummary = { rows: CatRow[]; spent: number; typical: number | null; priorMonths: number; monthLabel: string; charges: number };
export const MIN_CHARGES_FOR_TYPICAL = 30;

export function isTransferLike(category?: string | null, merchant?: string | null, status?: string | null): boolean {
  return status === "transfer" || /transfer|credit card payment|loan payment|payment/i.test(String(category ?? "")) || /\btransfer\b|payment thank you|autopay|online payment/i.test(String(merchant ?? ""));
}

export function categorySpend(rows: SpendRow[], now: Date, topN = 7): SpendSummary {
  const cur = now.toISOString().slice(0, 7);
  const byMonth = new Map<string, Map<string, number>>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const amt = Number(r.amount);
    if (!(amt > 0) || isTransferLike(r.category, r.merchant, r.status)) continue;
    const m = String(r.date).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const cat = (r.category ?? "").trim() || "Uncategorized";
    const mm = byMonth.get(m) ?? new Map<string, number>();
    mm.set(cat, (mm.get(cat) ?? 0) + amt);
    byMonth.set(m, mm);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const prior = [...byMonth.keys()].filter((m) => m < cur && (counts.get(m) ?? 0) >= MIN_CHARGES_FOR_TYPICAL).sort().slice(-3);
  const now_ = byMonth.get(cur) ?? new Map<string, number>();
  const cats = new Set<string>([...now_.keys()]);
  const typicalOf = (cat: string) => (prior.length ? prior.reduce((n, m) => n + (byMonth.get(m)?.get(cat) ?? 0), 0) / prior.length : null);
  const all: CatRow[] = [...cats].map((category) => ({ category, spent: round(now_.get(category) ?? 0), typical: typicalOf(category) === null ? null : round(typicalOf(category) as number) })).sort((a, b) => b.spent - a.spent);
  let shown = all;
  if (all.length > topN) {
    const rest = all.slice(topN);
    shown = [...all.slice(0, topN), { category: "Everything else", spent: round(rest.reduce((n, c) => n + c.spent, 0)), typical: prior.length ? round(rest.reduce((n, c) => n + (c.typical ?? 0), 0)) : null }];
  }
  const spent = round(all.reduce((n, c) => n + c.spent, 0));
  const typical = prior.length ? round(prior.reduce((n, m) => n + [...(byMonth.get(m)?.values() ?? [])].reduce((a, b) => a + b, 0), 0) / prior.length) : null;
  return { rows: shown, spent, typical, priorMonths: prior.length, monthLabel: cur, charges: counts.get(cur) ?? 0 };
}
const round = (n: number) => Math.round(n * 100) / 100;
