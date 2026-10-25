// Statements: which account a statement belongs to, and how it is named and filed. Pure helpers (client-safe).
export type AccountRow = { id: string; institution: string; last4: string; retired_at?: string | null };
export const accountLabel = (a: AccountRow) => `${a.institution} ····${a.last4}`;
const last4Of = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-4);

// The account whose last four digits are printed on the statement, or null.
export function matchAccount(accounts: AccountRow[], cardLast4: unknown): AccountRow | null {
  const l4 = last4Of(cardLast4);
  if (l4.length !== 4) return null;
  const live = accounts.filter((a) => !a.retired_at);
  return live.find((a) => a.last4 === l4) ?? null;
}
// An answer that names an account ("Wells Fargo ····0848") picks that account.
export function accountFromAnswer(accounts: AccountRow[], answer: string): AccountRow | null {
  return accounts.find((a) => accountLabel(a) === answer.trim()) ?? null;
}
// The statement month: the printed period, else the closing date's month, else the document date's month.
export function statementPeriod(r: { statement_period?: unknown; closing_date?: unknown; date?: unknown }): string | null {
  for (const v of [r.statement_period, r.closing_date, r.date]) { const s = String(v ?? ""); if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7); }
  return null;
}
export const statementName = (period: string, a: AccountRow) => `${period} ${accountLabel(a)} statement`;
export const statementHome = (period: string, a: AccountRow) => `Organized/Personal/Documents/Finance/${period.slice(0, 4)}/Statements/${a.id}/`;
