import Link from "next/link";
import { H1 } from "@/components/ui";
import { getAccounts, getUnmatchedCharges, money, shortDate, accountLabel } from "@/lib/data-money";
import { cleanBankText } from "@/lib/bank-text";

export const dynamic = "force-dynamic";
const PAGE = 40;

export default async function NoReceipt({ searchParams }: PageProps<"/money/no-receipt">) {
  const sp = await searchParams;
  const shown = Math.min(Math.max(Number(typeof sp.n === "string" ? sp.n : PAGE) || PAGE, PAGE), 400);
  const [accounts, charges] = await Promise.all([getAccounts(), getUnmatchedCharges()]);
  const list = charges.slice(0, shown);
  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent min-h-11 inline-flex items-center">‹ Money</Link>
      <H1 right={`${charges.length}`}>Charges with no receipt</H1>
      <p className="text-sm text-muted mb-3">Newest first. Tap one to add a photo, find the receipt in email, or explain it. A receipt that matches a charge by amount, date and vendor links itself and drops off this list.</p>
      <div className="card bg-soft text-xs mb-3">Most of these are not misses. Your Tiller history was just loaded, and your receipts only go back a few weeks, so older charges have nothing to match yet.</div>
      {charges.length === 0 ? <div className="card text-green font-semibold">Every charge has a receipt or an explanation.</div> : (
        <div className="flex flex-col gap-2">
          {list.map((t) => (
            <Link key={t.id} href={`/money/receipts?for=${t.id}`} className="card flex flex-col gap-0.5 min-h-14">
              <div className="flex justify-between gap-2 text-sm"><span className="font-semibold">{cleanBankText(t.merchant)}</span><span className="font-semibold">{money(t.amount)}</span></div>
              <div className="text-xs text-muted">{accountLabel(accounts.find((a) => a.id === t.account_id))} · {shortDate(t.date)}</div>
            </Link>
          ))}
        </div>
      )}
      {charges.length > shown && <Link href={`/money/no-receipt?n=${shown + PAGE}`} className="card mt-2 min-h-12 flex items-center justify-center text-sm font-semibold text-accent">Show {Math.min(PAGE, charges.length - shown)} more</Link>}
    </>
  );
}
