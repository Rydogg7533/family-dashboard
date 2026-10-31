// Payment cards (D-2026-10-27): client-safe types and label helpers. The reader lives in data-payment-cards.ts
// (server only). Every card belongs to exactly one account; the account's kind decides debit / credit / wallet.
import type { Account, Receipt } from "@/lib/data-money";

// Same text as data-money.accountLabel, kept here so client components never pull the server reader in.
const accountLabel = (a: Account | undefined) => (a ? `${a.institution} ••${a.last4}` : "[Account]");

export type PaymentCard = {
  id: string; account_id: string; form: "physical" | "virtual"; network: string | null; last4: string;
  label: string | null; holder: string | null; twin_of: string | null; replaced_by: string | null; retired_at: string | null; created_at: string;
};

export const samplePaymentCards: PaymentCard[] = [
  { id: "card-1", account_id: "amex-1004", form: "physical", network: "Amex", last4: "1004", label: null, holder: "Ryan", twin_of: null, replaced_by: null, retired_at: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "card-3", account_id: "chase-5521", form: "physical", network: "Visa", last4: "4521", label: null, holder: "Ryan", twin_of: null, replaced_by: null, retired_at: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "card-2", account_id: "amex-1004", form: "virtual", network: "Amex", last4: "7703", label: "Apple Wallet", holder: "Ryan", twin_of: "card-1", replaced_by: null, retired_at: null, created_at: "2026-01-01T00:00:00Z" },
];

// What a card is follows from its account: no separate field can disagree with the account.
export const cardKind = (accountKind: string | undefined): "debit" | "credit" | "wallet" =>
  accountKind === "checking" || accountKind === "savings" ? "debit" : accountKind === "credit" || accountKind === "business" ? "credit" : "wallet";

// "Visa debit ••4521", "Mastercard credit (Apple Wallet) ••7703"
export function cardLabel(c: PaymentCard, accounts: Account[]): string {
  const a = accounts.find((x) => x.id === c.account_id);
  const kind = cardKind(a?.kind);
  const form = c.form === "virtual" ? ` (${c.label || "virtual"})` : c.label ? ` (${c.label})` : "";
  return `${c.network ? `${c.network} ` : ""}${kind}${form} ••${c.last4}`;
}

// The chain a person reads on a receipt: "Visa debit ••4521 → Everyday Checking ••0848".
// Falls back to the receipt's free-text card (a label typed before cards were listed, or "Cash").
export function paidWithLabel(r: Pick<Receipt, "card"> & { paid_with_card_id?: string | null; paid_with_account_id?: string | null }, cards: PaymentCard[], accounts: Account[]): string | null {
  const c = r.paid_with_card_id ? cards.find((x) => x.id === r.paid_with_card_id) : null;
  if (c) return `${cardLabel(c, accounts)} → ${accountLabel(accounts.find((a) => a.id === c.account_id))}`;
  const a = r.paid_with_account_id ? accounts.find((x) => x.id === r.paid_with_account_id) : null;
  if (a) return accountLabel(a);
  return r.card ?? null;
}

// Chips for "Paid with": every live card as its label, then accounts that have no card listed (so they can still be tapped).
export function knownPaymentLabels(cards: PaymentCard[], accounts: Account[]): string[] {
  const live = cards.filter((c) => !c.retired_at && !c.replaced_by);
  const withCards = new Set(live.map((c) => c.account_id));
  const fromCards = live.map((c) => cardLabel(c, accounts));
  const bare = accounts.filter((a) => !a.retired_at && !withCards.has(a.id) && a.kind !== "checking" && a.kind !== "savings").map((a) => `${a.institution} ${a.last4}`);
  return Array.from(new Set([...fromCards, ...bare]));
}
