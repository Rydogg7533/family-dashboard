import Link from "next/link";
import { getRecurring, fmtDate, daysUntil, type RecurringItem } from "@/lib/data-day";
import { Card, H1 } from "@/components/ui";

export const dynamic = "force-dynamic";

// Recurring and renewals: the register of what comes around (F7.5 shares the subscriptions rows with Money;
// F9/F12.1 add vehicle and home dates). Needs-me first, then everything by next due date.
export default async function Recurring({ searchParams }: PageProps<"/recurring">) {
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" ? sp.kind : null;
  const all = await getRecurring();
  const items = (kind ? all.filter((i) => i.kind === kind) : all).sort((a, b) => a.next_due.localeCompare(b.next_due));
  const needs = items.filter((i) => i.status !== "ok");
  const rest = items.filter((i) => i.status === "ok");
  const chips = [["all", "All"], ["renewal", "Renewals"], ["subscription", "Subscriptions"], ["bill", "Bills"], ["event", "Home and seasonal"]];
  const KIND: Record<RecurringItem["kind"], string> = { renewal: "RENEWAL", subscription: "SUBSCRIPTION", bill: "BILL", event: "RECURRING" };

  function Row({ i }: { i: RecurringItem }) {
    const n = daysUntil(i.next_due);
    const when = n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue` : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
    return (
      <Card>
        <div className="flex justify-between gap-2">
          <div className="min-w-0">
            <div className={`text-[11px] font-bold tracking-wide ${i.status === "overdue" ? "text-red" : i.status === "soon" ? "text-amber" : "text-muted"}`}>{KIND[i.kind]}{i.entity ? ` · ${i.entity}` : ""}</div>
            <div className="font-semibold">{i.name}</div>
            <div className="text-sm text-muted">{fmtDate(i.next_due)} · {when} · {i.cycle} · {i.who}{i.amount_note ? ` · ${i.amount_note}` : ""}</div>
          </div>
        </div>
        <div className="text-xs text-muted mt-1">Reminders: {i.reminders.join(", ")} · <a href={i.source.href} className="font-semibold text-accent">Open in {i.source.name}</a></div>
      </Card>
    );
  }

  return (
    <>
      <H1 right={`${all.length} on the register`}>Recurring</H1>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        {chips.map(([k, label]) => <Link key={k} href={k === "all" ? "/recurring" : `/recurring?kind=${k}`} className={`px-3 py-1.5 rounded-full ${(k === "all" && !kind) || k === kind ? "bg-accent text-white" : "bg-soft"}`}>{label}</Link>)}
      </div>

      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2"><h2 className="text-base">Needs you</h2><span className="text-xs text-muted">{needs.length} due soon or overdue</span></div>
        {needs.length === 0 ? <Card className="text-muted">Nothing due in the next 10 days.</Card> : (
          <div className="flex flex-col gap-2">
            {needs.slice(0, 5).map((i) => <Row key={i.id} i={i} />)}
            {needs.length > 5 && <span className="text-sm font-semibold text-accent px-1">and {needs.length - 5} more</span>}
          </div>
        )}
      </section>

      <section className="mb-5">
        <h2 className="text-base mb-2">Coming up</h2>
        <div className="flex flex-col gap-2">{rest.map((i) => <Row key={i.id} i={i} />)}</div>
      </section>

      <p className="text-xs text-muted">Subscriptions and bills are the same rows as <Link href="/money/recurring" className="font-semibold text-accent">Money › Recurring</Link> (amounts, cards, where to cancel, decisions). Vehicle dates come from <Link href="/vehicles" className="font-semibold text-accent">Vehicles</Link>, home dates from the <Link href="/home" className="font-semibold text-accent">Home register</Link>. One reminder per item at its lead time; it repeats only if the date passes unrecorded.</p>
    </>
  );
}
