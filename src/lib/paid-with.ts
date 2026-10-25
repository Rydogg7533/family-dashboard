// "Paid with" on an Inbox card: a suggestion from past receipts, and the choices offered. Pure helpers (client-safe).
// A suggestion needs the last SUGGEST_AFTER receipts of the same vendor by the same person to agree on one card (the consistency gate);
// mixed history never suggests anything. It pre-fills a choice; the person still taps.
export const SUGGEST_AFTER = 3;
export const SKIP = "__skip__";
export const CLEAR = "__clear__";
export type CardHistory = { card: string | null; person: string | null; vendorKey: string; at: string };

// history: any receipts with a vendorKey; newest first or not, it is sorted here.
export function suggestCard(history: CardHistory[], vendorKey: string, person: string | null): { card: string; count: number } | null {
  if (!vendorKey) return null;
  const mine = history.filter((h) => h.vendorKey === vendorKey && h.card && (person == null || h.person === person)).sort((a, b) => (a.at < b.at ? 1 : -1));
  if (mine.length < SUGGEST_AFTER) return null;
  const last = mine.slice(0, SUGGEST_AFTER);
  const card = last[0].card as string;
  return last.every((h) => h.card === card) ? { card, count: SUGGEST_AFTER } : null;
}

export const suggestionReason = (s: { card: string; count: number }, vendor: string) => `Your last ${s.count} ${vendor} receipts were ${s.card}`;
export const CASH = "Cash";
