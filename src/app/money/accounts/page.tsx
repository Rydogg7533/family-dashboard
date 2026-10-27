import { getPeople } from "@/lib/data-registers";
import Link from "next/link";
import { H1 } from "@/components/ui";
import { AccountsManager } from "@/components/AccountsManager";
import { CardsManager } from "@/components/CardsManager";
import { getAccounts } from "@/lib/data-money";
import { getPaymentCards } from "@/lib/data-payment-cards";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, people, cards] = await Promise.all([getAccounts(), getPeople(), getPaymentCards()]);
  const owners = people.filter((p) => p.role === "parent").map((p) => p.name);
  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1>Accounts and statements</H1>
      <p className="text-xs text-muted mb-3">Every card and bank account owes a statement each month. List them once here; each month&apos;s statements are checked off as they arrive, and a month cannot be closed until all are in. Accounts are retired, never deleted.</p>
      <AccountsManager accounts={accounts} owners={owners} />
      <h2 className="mt-6 mb-1 text-base font-semibold">Cards</h2>
      <p className="text-xs text-muted mb-3">Each card belongs to one account: a debit card to the checking or savings account it draws on, a credit card to its credit account. A credit account can carry a physical card and a virtual one with a different number (Apple Wallet). Receipts then show which card paid and which account it draws on. Last four only.</p>
      <CardsManager cards={cards} accounts={accounts} owners={owners} />
    </>
  );
}
