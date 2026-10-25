// What a receipt actually paid for, as printed on the paper: Covers (the account, workspace, plan or thing), Period (the dates it covers) and
// Reference (an invoice, order or confirmation number). Optional, never guessed, never an account or card number. Pure helpers (client-safe).
export type ReceiptDetails = { covers: string | null; period: string | null; reference: string | null };
export const DETAIL_KEYS = ["covers", "period", "reference"] as const;
const MAX = { covers: 120, period: 60, reference: 60 } as const;
const AMAZON_ORDER = /\b\d{3}-\d{7}-\d{7}\b/g;

// A run of 9+ digits, or 13 to 19 digits strung together with single spaces or dashes (a card number's shape), is dropped; an Amazon order number is allowed.
export function looksLikeSecretNumber(s: string): boolean {
  const t = s.replace(AMAZON_ORDER, " ");
  return /\d{9,}/.test(t) || /(?:\d[ -]?){13,19}/.test(t.replace(/\d{1,8}[A-Za-z]/g, " "));
}

export function cleanDetail(v: unknown, key: keyof typeof MAX): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t || /^(null|none|n\/a|unknown|not stated|-)$/i.test(t)) return null;
  if (looksLikeSecretNumber(t)) return null;
  return t.slice(0, MAX[key]);
}

export function cleanDetails(src: Record<string, unknown> | null | undefined): ReceiptDetails {
  return { covers: cleanDetail(src?.covers, "covers"), period: cleanDetail(src?.period, "period"), reference: cleanDetail(src?.reference, "reference") };
}

// "Covers: medrepdesk.io, 3 seats · Period: Oct 2026 · Ref: INV-1042", or "" when the paper stated none of them.
export function detailsLine(d: Partial<ReceiptDetails> | null | undefined): string {
  const parts = [d?.covers && `Covers: ${d.covers}`, d?.period && `Period: ${d.period}`, d?.reference && `Ref: ${d.reference}`].filter(Boolean);
  return parts.join(" · ");
}

// Has this item been read for details yet? The three keys are written (as null when absent) the first time, so a null is an answer, not a gap.
export const detailsRead = (rr: Record<string, unknown> | null | undefined): boolean => !!rr && "covers" in rr && "period" in rr && "reference" in rr;
