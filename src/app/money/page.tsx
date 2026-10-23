import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section, OpenIn, SyncLine, Bar, ProofDot } from "@/components/money";
import { getAccounts, getTransactions, getReceipts, getReconciliations, getRecurring, getCategorySpend, getSpendingMonitor, getProofs, buildNeedsMe, money, shortDate, daysUntil, accountLabel, proofState } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function Money() {
  const [accounts, tx, receipts, recs, recurring, cats, monitor, proofs] = await Promise.all([getAccounts(), getTransactions(), getReceipts(), getReconciliations(), getRecurring(), getCategorySpend(), getSpendingMonitor(), getProofs()]);
  const needs = buildNeedsMe(tx, receipts, recs, recurring, accounts);
  const top = needs.slice(0, 5);
  const spent = cats.reduce((n, c) => n + c.spent, 0), typical = cats.reduce((n, c) => n + c.typical, 0);
  const cash = accounts.filter((a) => a.kind === "checking" || a.kind === "savings" || a.kind === "business").reduce((n, a) => n + (a.balance_current ?? 0), 0);
  const reconciled = recs.length ? Math.round((recs.reduce((n, r) => n + r.tied_lines, 0) / recs.reduce((n, r) => n + r.total_lines, 0)) * 100) : 100;
  const behind = accounts.filter((a) => a.unreconciled > 0);
  const red = tx.filter((t) => proofState(t.id, proofs).state === "red").length;
  const amber = tx.filter((t) => proofState(t.id, proofs).state === "amber").length;
  const subs = recurring.filter((r) => r.kind === "subscription");
  const monthly = recurring.reduce((n, r) => n + (r.cycle === "yearly" ? r.amount / 12 : r.cycle === "weekly" ? r.amount * 4.33 : r.amount), 0);
  const nextSub = [...recurring].sort((a, b) => a.next_charge.localeCompare(b.next_charge))[0];
  const synced = accounts[0]?.synced_at ?? new Date().toISOString();

  return (
    <>
      <H1 right={<SyncLine at={synced} />}>Money</H1>

      <Section title="Needs me" right={needs.length ? `${needs.length} open` : "all good"}>
        {top.length === 0 ? <div className="card text-muted">Nothing needs you. Every charge has a receipt or an explanation.</div> : (
          <div className="flex flex-col gap-2">
            {top.map((n) => (
              <Link key={n.id} href={n.href} className="card flex flex-col gap-0.5">
                <div className="flex justify-between gap-2">
                  <div className={`text-[11px] font-bold tracking-wide ${n.kind === "flag" || n.kind === "unmatched" ? "text-amber" : "text-accent"}`}>{n.kind === "unmatched" ? "MISSING RECEIPT" : n.kind === "ask" ? "ANSWER" : n.kind === "reconcile" ? "CLOSE" : n.kind === "due" ? "DUE SOON" : n.kind === "ack" ? "ACKNOWLEDGE" : "FLAG"}</div>
                  <span className="text-[11px] text-muted">{n.effort === "tap" ? "30-second tap" : "needs thought"}</span>
                </div>
                <div className="font-semibold text-sm">{n.title}</div>
                <div className="text-xs text-muted">{n.detail}</div>
                <div className="text-[11px] text-muted">{n.who}</div>
              </Link>
            ))}
            {needs.length > top.length && <Link href="/money/receipts" className="text-sm font-semibold text-accent px-1">and {needs.length - top.length} more</Link>}
          </div>
        )}
      </Section>

      <Section title="At a glance">
        <div className="grid grid-cols-2 gap-2">
          <div className="card"><div className="text-[11px] text-muted">Month to date</div><div className="font-semibold">{money(spent)}</div><div className="text-[11px] text-muted">typical {money(typical)}</div></div>
          <div className="card"><div className="text-[11px] text-muted">Cash across accounts</div><div className="font-semibold">{money(cash)}</div><div className="text-[11px] text-muted">as of last sync</div></div>
          <div className="card"><div className="text-[11px] text-muted">Statement closes</div>
            {accounts.filter((a) => a.kind === "credit").map((a) => { const n = closeIn(a.statement_close_day); return <div key={a.id} className="text-xs"><span className="font-semibold">••{a.last4}</span> in {n} d</div>; })}
          </div>
          <div className="card"><div className="text-[11px] text-muted">Reconciled</div><div className={`font-semibold ${reconciled === 100 ? "text-green" : "text-amber"}`}>{reconciled}%</div><div className="text-[11px] text-muted">{behind.length ? `${behind.length} behind` : "all through last close"}</div></div>
        </div>
        <div className="card mt-2 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><ProofDot state="green" /> {tx.length - red - amber}</span>
          <span className="flex items-center gap-1"><ProofDot state="amber" /> {amber}</span>
          <span className="flex items-center gap-1"><ProofDot state="red" /> {red}</span>
          <span className="text-muted">proof on recent charges · closes cannot finish with red</span>
        </div>
      </Section>

      <Section title="This month" right={<OpenIn label="Tiller" />}>
        <div className="card flex flex-col gap-2">
          {cats.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-xs mb-1"><span className="font-semibold">{c.category}</span><span className={c.spent > c.typical ? "text-amber font-semibold" : "text-muted"}>{money(c.spent)} <span className="text-muted">/ {money(c.typical)} typical</span></span></div>
              <Bar value={c.spent} max={Math.max(c.typical, c.spent)} tone={c.spent > c.typical ? "amber" : "accent"} />
            </div>
          ))}
          <div className="text-[11px] text-muted">Transfers between own accounts are shown separately and never count as spending. Business and personal are split per entity.</div>
        </div>
      </Section>

      <Section title="Accounts" right={<OpenIn label="Tiller" />}>
        <div className="flex flex-col gap-2">
          {accounts.map((a) => (
            <Link key={a.id} href={`/money/reconcile/${a.id}`} className="card flex justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm">{accountLabel(a)} <span className="text-xs text-muted font-normal">· {a.owner} · {a.entity}</span></div>
                <div className="text-xs text-muted">
                  {a.balance_current !== null && <span>{money(a.balance_current)} now</span>}
                  {a.balance_statement !== null && <span> · {money(a.balance_statement)} statement</span>}
                  {a.due_day && <span> · due the {a.due_day}{ord(a.due_day)}{a.autopay ? ", autopay" : ", not on autopay"}</span>}
                </div>
                <div className="text-xs text-muted">Reconciled {a.last_reconciled ? shortDate(a.last_reconciled) : "never"}{a.unreconciled ? <span className="text-amber font-semibold"> · {a.unreconciled} unreconciled</span> : ""}{a.vault_item ? ` · login: ${a.vault_item}` : ""}</div>
              </div>
              <span className="text-muted">›</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Reconciliations" right="monthly, per statement">
        <div className="flex flex-col gap-2">
          {recs.map((r) => (
            <Link key={r.id} href={`/money/reconcile/${r.account_id}`} className="card flex flex-col gap-1.5">
              <div className="flex justify-between text-sm"><span className="font-semibold">{accountLabel(accounts.find((a) => a.id === r.account_id))} · {r.period}</span><span className={`text-xs font-bold ${r.status === "done" ? "text-green" : r.status === "exceptions" ? "text-red" : "text-amber"}`}>{r.status === "done" ? "DONE" : r.status === "exceptions" ? "EXCEPTIONS" : "OPEN"}</span></div>
              <Bar value={r.tied_lines} max={r.total_lines} tone={r.status === "done" ? "green" : r.status === "exceptions" ? "red" : "amber"} />
              <div className="text-[11px] text-muted">For {r.for_person} · from Tiller</div>
              <div className="text-xs text-muted">{r.tied_lines} of {r.total_lines} lines tied{r.to_explain ? <span className="text-amber font-semibold"> · {r.to_explain} to explain</span> : ""}{r.due_at && r.status !== "done" ? ` · ${daysUntil(r.due_at) < 0 ? "overdue" : `due ${shortDate(r.due_at)}`}` : ""}{r.summary ? ` · ${r.summary}` : ""}</div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Subscriptions and recurring" right={<Link href="/money/recurring" className="font-semibold text-accent">Register ›</Link>}>
        <div className="card flex flex-col gap-1 text-sm">
          <div className="flex justify-between"><span>{recurring.length} items · about {money(monthly)} a month</span></div>
          {nextSub && <div className="text-xs text-muted">Next charge: {nextSub.name} {money(nextSub.amount)} on {shortDate(nextSub.next_charge)}</div>}
          <div className="text-xs text-muted">{subs.filter((s) => s.decision === "cancel").length} cancel-prep task{subs.filter((s) => s.decision === "cancel").length === 1 ? "" : "s"} prepared · {recurring.filter((r) => r.ack_waiting).length} waiting on acknowledgement · {recurring.filter((r) => !r.on_register).length} not on the register</div>
          <div className="flex gap-3 mt-1"><Link href="/money/subscriptions" className="text-xs font-semibold text-accent">Subscriptions</Link><Link href="/money/recurring" className="text-xs font-semibold text-accent">Bills and charges</Link></div>
        </div>
      </Section>

      <Section title="Spending monitor" right={`shared with ${monitor.shared_with}`}>
        <div className="card flex flex-col gap-2">
          <div className="flex justify-between text-sm"><span>Today</span><span className={`font-semibold ${monitor.total_today > monitor.daily_threshold ? "text-amber" : ""}`}>{money(monitor.total_today)} <span className="text-muted font-normal">/ {money(monitor.daily_threshold)} threshold</span></span></div>
          <Bar value={monitor.total_today} max={monitor.daily_threshold} tone={monitor.total_today > monitor.daily_threshold ? "amber" : "green"} />
          <div className="flex justify-between text-sm"><span>This week</span><span className="text-muted">{money(monitor.week_to_date)} / {money(monitor.weekly_typical)} typical</span></div>
          <Bar value={monitor.week_to_date} max={monitor.weekly_typical} />
          <div className="text-[11px] text-muted">Both of you see the same daily total. Immediate alert on a single charge over {money(monitor.single_charge_alert)}; thresholds in Settings › Money.</div>
        </div>
      </Section>

      <Section title="Reports and tax">
        <div className="card flex flex-col text-sm">
          {[["Monthly close summaries", "#"], ["Year to date by category and entity", "#"], ["Tax year 2026 packet (per entity)", "/records?tax=2026"], ["Mileage and business trips", "#"], ["Export for the accountant", "#"], ["Resolved and history", "/money/receipts?view=history"]].map(([l, h]) => (
            <Link key={l} href={h} className="flex justify-between min-h-11 items-center border-b border-line last:border-0"><span>{l}</span><span className="text-muted">›</span></Link>
          ))}
        </div>
      </Section>

      <p className="text-[11px] text-muted mb-2">Money is recorded, never moved. Paying, transferring, cancelling and disputing happen outside the dashboard, by a person, from a prepared task. Read-only through Tiller; last four digits only.</p>
    </>
  );
}

function closeIn(day: number | null) {
  if (!day) return "—";
  const now = new Date(); const t = new Date(now.getFullYear(), now.getMonth(), day);
  if (t.getTime() < now.getTime()) t.setMonth(t.getMonth() + 1);
  return Math.round((t.getTime() - now.getTime()) / 86_400_000);
}
function ord(n: number) { return n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"; }
