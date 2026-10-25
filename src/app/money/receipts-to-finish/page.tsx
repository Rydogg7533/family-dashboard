import Link from "next/link";
import { H1 } from "@/components/ui";
import { FinishCard } from "@/components/FinishCard";
import { getAccounts, getReceipts, money, shortDate } from "@/lib/data-money";
import { splitToFinish, type FinishReceipt } from "@/lib/receipts-to-finish";
import { suggestCard, suggestionReason, type CardHistory } from "@/lib/paid-with";
import { normalizeVendor } from "@/lib/receipt-match";

export const dynamic = "force-dynamic";
const SHOW_FIRST = 5;

export default async function ReceiptsToFinish({ searchParams }: PageProps<"/money/receipts-to-finish">) {
  const sp = await searchParams;
  const all = sp.all === "1";
  const [accounts, receipts] = await Promise.all([getAccounts(), getReceipts()]);
  // getReceipts reads every column; uploaded_by and created_at are present at runtime.
  const rich = receipts as (typeof receipts[number] & { uploaded_by?: string | null; created_at?: string })[];
  const { noCard, waiting, total } = splitToFinish(rich as FinishReceipt[], Date.now());
  const history: CardHistory[] = rich.filter((r) => !!r.card).map((r) => ({ card: r.card as string, person: r.uploaded_by ?? null, vendorKey: normalizeVendor(r.merchant), at: String(r.created_at ?? r.date) }));
  const known = Array.from(new Set([...accounts.filter((a) => !a.retired_at && a.kind !== "checking" && a.kind !== "savings").map((a) => `${a.institution} ${a.last4}`), ...history.map((h) => h.card as string).filter((c) => c !== "Cash")]));
  const props = (r: (typeof noCard)[number]) => {
    const s = r.card ? null : suggestCard(history, normalizeVendor(r.merchant), r.uploaded_by ?? null);
    return { id: r.id, merchant: r.merchant, amountLabel: money(r.amount), dateLabel: shortDate(r.date), ageDays: r.ageDays, card: r.card ?? null, unconfirmed: r.unconfirmed, overdue: r.overdue, suggestion: s ? { card: s.card, reason: suggestionReason(s, r.merchant) } : null, known };
  };
  const noCardShown = all ? noCard : noCard.slice(0, SHOW_FIRST);
  const waitingShown = all ? waiting : waiting.slice(0, SHOW_FIRST);

  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent min-h-11 inline-flex items-center">‹ Money</Link>
      <H1>Receipts to finish</H1>
      <p className="text-sm text-muted mb-3">{total} filed, waiting to settle. Matched ones leave this page on their own.</p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <a href="#no-card" className={`card flex flex-col min-h-16 justify-center ${noCard.length ? "border-amber bg-amber-bg" : ""}`}><span className={`text-2xl font-bold ${noCard.length ? "text-amber" : "text-green"}`}>{noCard.length}</span><span className="text-xs font-semibold">No card yet</span></a>
        <a href="#waiting" className="card flex flex-col min-h-16 justify-center"><span className="text-2xl font-bold">{waiting.length}</span><span className="text-xs font-semibold text-muted">Waiting for the charge</span></a>
      </div>

      {total === 0 && <div className="card text-green font-semibold mb-4">All settled. Every filed receipt has its card and its charge.</div>}

      <section id="no-card" className="mb-5">
        <h2 className="text-[11px] font-bold tracking-wide text-amber mb-2">NO CARD YET · {noCard.length}</h2>
        {noCard.length === 0 ? <div className="card text-muted text-sm">Every filed receipt has a card.</div> : <div className="flex flex-col gap-2">{noCardShown.map((r) => <FinishCard key={r.id} {...props(r)} />)}</div>}
        {!all && noCard.length > SHOW_FIRST && <Link href="/money/receipts-to-finish?all=1#no-card" className="card mt-2 min-h-12 flex items-center justify-center text-sm font-semibold text-accent">Show the other {noCard.length - SHOW_FIRST}</Link>}
      </section>

      <section id="waiting" className="mb-5">
        <h2 className="text-[11px] font-bold tracking-wide text-muted mb-2">WAITING FOR THE CHARGE · {waiting.length}</h2>
        {waiting.length === 0 ? <div className="card text-muted text-sm">Nothing waiting for a charge.</div> : <div className="flex flex-col gap-2">{waitingShown.map((r) => <FinishCard key={r.id} {...props(r)} />)}</div>}
        {!all && waiting.length > SHOW_FIRST && <Link href="/money/receipts-to-finish?all=1#waiting" className="card mt-2 min-h-12 flex items-center justify-center text-sm font-semibold text-accent">Show the other {waiting.length - SHOW_FIRST}</Link>}
      </section>

      <div className="card bg-soft text-sm"><div className="text-[11px] font-bold tracking-wide text-accent mb-1">WHEN A CHARGE MATCHES</div>The receipt and the charge link, and it moves to Money › Receipts as Matched. Nothing is deleted.</div>
    </>
  );
}
