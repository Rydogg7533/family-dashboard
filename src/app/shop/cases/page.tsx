import Link from "next/link";
import { getCases } from "@/lib/data-shop";
import { Card, H1 } from "@/components/ui";
import { CaseCard } from "@/components/c/OrdersView";

export const dynamic = "force-dynamic";

// F20 support cases: built by the assistant, submitted by a person, tracked to a confirmed resolution.
export default async function Cases() {
  const cases = await getCases();
  const open = cases.filter((c) => c.status !== "resolved");
  const closed = cases.filter((c) => c.status === "resolved");
  return (
    <>
      <H1 right={<Link href="/shop/orders" className="font-semibold text-accent">‹ Orders</Link>}>Support cases</H1>
      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2"><h2 className="text-base">Open</h2><span className="text-xs text-muted">{open.length} · closes only when you confirm</span></div>
        {open.length === 0 ? <Card className="text-muted">No open cases.</Card> : <div className="flex flex-col gap-2">{open.map((c) => <CaseCard key={c.id} c={c} />)}</div>}
      </section>
      {closed.length > 0 && <section className="mb-5"><h2 className="text-base mb-2">Resolved</h2><div className="flex flex-col gap-2">{closed.map((c) => <CaseCard key={c.id} c={c} />)}</div></section>}
      <p className="text-xs text-muted">Each case: order number, store, item, price, photo or receipt, dates, the store's support route and policy. Fastest route per store (in-app screen opened with details ready; web form filled; store chat from the Mac mini with your approval). Refunds are watched on the card (F2); one nudge at the stated timeline; one line on Today while open. Everything in the <Link href="/log" className="font-semibold text-accent">Log</Link>.</p>
    </>
  );
}
