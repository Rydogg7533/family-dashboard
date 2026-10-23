import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section, OpenIn } from "@/components/money";
import { getAccounts, getRecurring, money, shortDate, daysUntil, accountLabel } from "@/lib/data-money";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { subscription: "Subscription", bill: "Bill", loan: "Loan", insurance: "Insurance" };

export default async function Recurring() {
  const [accounts, items] = await Promise.all([getAccounts(), getRecurring()]);
  const sorted = [...items].sort((a, b) => a.next_charge.localeCompare(b.next_charge));
  const monthly = items.reduce((n, r) => n + (r.cycle === "yearly" ? r.amount / 12 : r.cycle === "weekly" ? r.amount * 4.33 : r.amount), 0);
  const soon = sorted.filter((r) => daysUntil(r.next_charge) <= 7);
  const acc = (id: string) => accounts.find((a) => a.id === id);

  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1>Bills and charges</H1>
      <p className="text-xs text-muted mb-3">Every subscription, bill, loan payment and premium: {items.length} items, about {money(monthly)} a month.</p>

      <Section title="Next 7 days" right={`${soon.length}`}>
        {soon.length === 0 ? <div className="card text-muted text-sm">Nothing charges in the next week.</div> : (
          <div className="flex flex-col gap-2">{soon.map((r) => {
            const a = acc(r.account_id); const autopay = a?.autopay || r.kind === "subscription";
            return (
              <div key={r.id} className="card flex flex-col gap-1">
                <div className="flex justify-between text-sm"><span className="font-semibold">{r.name}</span><span className="font-semibold">{money(r.amount)}</span></div>
                <div className="text-xs text-muted">{shortDate(r.next_charge)} · {accountLabel(a)} · {r.entity} · {autopay ? <span className="text-green font-semibold">autopay</span> : <span className="text-amber font-semibold">not on autopay: task prepared, you pay</span>}</div>
                <div className="text-[11px] text-muted">{r.decided_by} · from the register · <OpenIn label="register sheet" /></div>
              </div>
            );
          })}</div>
        )}
      </Section>

      <Section title="Register" right={<OpenIn label="register sheet" />}>
        <div className="card flex flex-col">
          {sorted.map((r) => (
            <div key={r.id} className="py-2.5 border-b border-line last:border-0 flex flex-col gap-0.5">
              <div className="flex justify-between text-sm"><span className="font-semibold">{r.name}</span><span>{money(r.amount)} <span className="text-xs text-muted">/ {r.cycle.replace("ly", "")}</span></span></div>
              <div className="text-xs text-muted">{KIND[r.kind]} · next {shortDate(r.next_charge)} · {accountLabel(acc(r.account_id))} · {r.entity}{r.both_names ? " · both names" : ""}{r.last_negotiated ? ` · negotiated ${r.last_negotiated}` : ""}</div>
              <div className="text-xs">
                <span className={`font-semibold ${r.decision === "cancel" ? "text-red" : r.decision === "review" ? "text-amber" : "text-green"}`}>{r.decision}</span>
                {!r.on_register && <span className="text-amber font-semibold"> · not on the register yet</span>}
                {r.ack_waiting && <span className="text-amber"> · waiting on {r.ack_waiting}</span>}
                <span className="text-muted"> · {r.decided_by}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <p className="text-[11px] text-muted">Changing, cancelling or negotiating happens outside the dashboard from a prepared task. Changes to shared money need both parents&apos; acknowledgement (Change Log). See <Link href="/money/subscriptions" className="font-semibold text-accent">Subscriptions</Link> for decisions and cancel-prep.</p>
    </>
  );
}
