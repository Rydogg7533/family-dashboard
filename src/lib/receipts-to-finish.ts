// "Receipts to finish": filed receipts still waiting on a card or on their charge. Pure helpers (client-safe).
// A receipt is "to finish" while its status is expecting_charge. It leaves by itself when the matcher links it
// (status becomes matched) or when a card is picked and the charge arrives. Nothing here deletes or edits anything.
export const OVERDUE_DAYS = 14;

export type FinishReceipt = {
  id: string; merchant: string; amount: number; date: string; status: string;
  card?: string | null; card_confidence?: string | null; uploaded_by?: string | null;
};
export type FinishRow = FinishReceipt & { ageDays: number; overdue: boolean; unconfirmed: boolean };

export function ageInDays(date: string, nowMs: number): number {
  const t = Date.parse(date.length === 10 ? `${date}T12:00:00Z` : date);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

export function splitToFinish(receipts: FinishReceipt[], nowMs: number): { noCard: FinishRow[]; waiting: FinishRow[]; total: number } {
  const rows = receipts.filter((r) => r.status === "expecting_charge").map((r) => {
    const ageDays = ageInDays(r.date, nowMs);
    const hasCard = !!r.card && r.card.trim() !== "";
    return { ...r, ageDays, overdue: hasCard && ageDays > OVERDUE_DAYS, unconfirmed: hasCard && r.card_confidence !== "high" };
  });
  const noCard = rows.filter((r) => !r.card || r.card.trim() === "").sort((a, b) => b.ageDays - a.ageDays);
  // Overdue first (they need a look), then oldest first.
  const waiting = rows.filter((r) => !!r.card && r.card.trim() !== "").sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.ageDays - a.ageDays);
  return { noCard, waiting, total: rows.length };
}
