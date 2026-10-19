import Link from "next/link";
import { getOrders } from "@/lib/data-shop";
import { getSyncStatus } from "@/lib/data-day";
import { Card, H1 } from "@/components/ui";
import { OrderCard } from "@/components/c/OrdersView";
import { SyncLine } from "@/components/c/SyncLine";

export const dynamic = "force-dynamic";

// F20: orders tracked from the stores' emails and texts, placed → shipped → out for delivery → delivered (photo) → received.
export default async function Orders() {
  const [orders, sync] = await Promise.all([getOrders(), getSyncStatus(["orders"])]);
  const needs = orders.filter((o) => o.status === "delivered" || o.status === "problem");
  const open = orders.filter((o) => ["placed", "shipped", "out_for_delivery"].includes(o.status));
  const done = orders.filter((o) => o.status === "received");
  return (
    <>
      <H1 right={<Link href="/shop" className="font-semibold text-accent">‹ Shop</Link>}>Orders</H1>
      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2"><h2 className="text-base">Needs you</h2><span className="text-xs text-muted">{needs.length}</span></div>
        {needs.length === 0 ? <Card className="text-muted">Nothing to confirm.</Card> : <div className="flex flex-col gap-2">{needs.slice(0, 5).map((o) => <OrderCard key={o.id} o={o} />)}{needs.length > 5 && <span className="text-sm font-semibold text-accent px-1">and {needs.length - 5} more</span>}</div>}
      </section>
      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2"><h2 className="text-base">On the way</h2><span className="text-xs text-muted">{open.length} · pickup windows are on the schedule</span></div>
        {open.length === 0 ? <Card className="text-muted">No open orders.</Card> : <div className="flex flex-col gap-2">{open.map((o) => <OrderCard key={o.id} o={o} />)}</div>}
      </section>
      {done.length > 0 && <section className="mb-5"><h2 className="text-base mb-2">Received</h2><div className="flex flex-col gap-2">{done.map((o) => <OrderCard key={o.id} o={o} />)}</div></section>}
      <section className="card"><SyncLine items={sync} /></section>
      <p className="text-xs text-muted mt-3">If no confirmation arrives within an hour of a hand-off, one gentle “did the order go through?”. Problems: <Link href="/shop/cases" className="font-semibold text-accent">Support cases</Link>.</p>
    </>
  );
}
