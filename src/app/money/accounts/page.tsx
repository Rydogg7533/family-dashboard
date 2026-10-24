import { getPeople } from "@/lib/data-registers";
import Link from "next/link";
import { H1 } from "@/components/ui";
import { AccountsManager } from "@/components/AccountsManager";
import { getAccounts } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, people] = await Promise.all([getAccounts(), getPeople()]);
  const owners = people.filter((p) => p.role === "parent").map((p) => p.name);
  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1>Accounts and statements</H1>
      <p className="text-xs text-muted mb-3">Every card and bank account owes a statement each month. List them once here; each month&apos;s statements are checked off as they arrive, and a month cannot be closed until all are in. Accounts are retired, never deleted.</p>
      <AccountsManager accounts={accounts} owners={owners} />
    </>
  );
}
