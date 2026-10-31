import { getPeople } from "@/lib/data-registers";
import Link from "next/link";
import { H1 } from "@/components/ui";
import { AccountsAndCards as AccountsAndCardsList } from "@/components/AccountsAndCards";
import { getAccounts } from "@/lib/data-money";
import { getPaymentCards } from "@/lib/data-payment-cards";

export const dynamic = "force-dynamic";

// Set-once reference: which accounts and cards exist (D-2026-10-27, moved here from /money/accounts because it is
// setup data, not the monthly routine). The Money tab shows balances, statements and reconciliation.
export default async function AccountsAndCards() {
  const [accounts, people, cards] = await Promise.all([getAccounts(), getPeople(), getPaymentCards()]);
  const owners = people.filter((p) => p.role === "parent").map((p) => p.name);
  return (
    <>
      <Link href="/settings" className="text-xs font-semibold text-accent">‹ Settings</Link>
      <H1>Accounts and cards</H1>
      <p className="text-xs text-muted mb-3">Every bank account, credit account and payment app that owes a statement each month, grouped by what it is. List each once; the Money tab checks statements off as they arrive. A card belongs to one account: a debit card to the checking or savings account it draws on, a credit card to its credit account. Owners change these; accounts are retired, never deleted.</p>
      <AccountsAndCardsList accounts={accounts} cards={cards} owners={owners} />
    </>
  );
}
