import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section, SyncLine, Bar, ProofDot } from "@/components/money";
import { getRoutine } from "@/lib/data-money-routine";
import { splitToFinish } from "@/lib/receipts-to-finish";
import { getAccounts, getTransactions, getReceipts, getReconciliations, getRecurring, getSpendSummary, getUnmatchedCharges, getProofs, buildNeedsMe, money, shortDate, daysUntil, accountLabel, proofState } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function Money() {
  const [accounts, tx, receipts, recs, recurring, summary, proofs] = await Promise.all([getAccounts(), getTransactions(), getReceipts(), getReconciliations(), getRecurring(), getSpendSummary(), getProofs()]);
  const unmatched = await getUnmatchedCharges();
  const needs = buildNeedsMe(tx, receipts, recs, recurring, accounts);
  const routine = await getRoutine();
  const routineOverdue = routine?.items.filter((i) => i.overdue).length ?? 0;
  const finish = splitToFinish(receipts, Date.now());
  const matchedCount = receipts.filter((r) => r.status === "matched").length;
  const needsMe = needs.filter((n) => n.kind !== "unmatched");   // missing-receipt cards live in the Receipts card and their own page
  const top = needsMe.slice(0, 5);
  const cats = summary.rows, spent = summary.spent, typical = summary.typical;
  const hasBalances = accounts.some((a) => a.balance_current !== null);
  const cash = accounts.filter((a) => a.kind === "checking" || a.kind === "savings" || a.kind === "business").reduce((n, a) => n + (a.balance_current ?? 0), 0);
  const recLines = recs.reduce((n, r) => n + r.total_lines, 0);
  const reconciled = recs.length && recLines ? Math.round((recs.reduce((n, r) => n + r.tied_lines, 0) / recLines) * 100) : null;
  const behind = accounts.filter((a) => a.unreconciled > 0);
  // A charge linked to a receipt (by the matcher or a person) is never "no proof": it counts as at least amber.
  const red = tx.filter((t) => proofState(t.id, proofs).state === "red" && !t.matched_receipt).length;
  const amber = tx.filter((t) => proofState(t.id, proofs).state === "amber" || (proofState(t.id, proofs).state === "red" && !!t.matched_receipt)).length;
  const subs = recurring.filter((r) => r.kind === "subscription");
  const monthly = recurring.reduce((n, r) => n + (r.cycle === "yearly" ? r.amount / 12 : r.cycle === "weekly" ? r.amount * 4.33 : r.amount), 0);
  const nextSub = [...recurring].sort((a, b) => a.next_charge.localeCompare(b.next_charge))[0];
  const synced = accounts.map((a) => a.synced_at).filter(Boolean).sort().at(-1) ?? new Date().toISOString();

  return (
    <>
      <H1 right={<SyncLine at={synced} />}>Money</H1>

      <section className="card mb-5 p-0 overflow-hidden" aria-label="Receipts">
        <Link href="/money/receipts-to-finish" className={`flex flex-col gap-1.5 p-4 min-h-14 ${finish.total ? "bg-amber-bg" : ""}`}>
          <div className="flex justify-between items-center gap-2"><span className="text-base font-bold">Receipts to finish</span><span className={`text-2xl font-bold ${finish.total ? "text-amber" : "text-green"}`}>{finish.total}</span></div>
          {finish.total ? <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-soft px-2.5 py-1 text-amber">{finish.noCard.length} need a card</span><span className="rounded-full bg-soft px-2.5 py-1">{finish.waiting.length} waiting for the charge</span></div> : <div className="text-sm text-green font-semibold">All settled</div>}
        </Link>
        <Link href="/money/no-receipt" className="flex justify-between items-center gap-2 p-4 min-h-14 border-t border-line"><span><span className="text-base font-bold">Charges with no receipt</span><span className="block text-xs text-muted">from Tiller, newest first</span></span><span className="text-2xl font-bold">{unmatched.length}</span></Link>
        <Link href="/money/receipts?view=matched" className="flex justify-between items-center gap-2 p-4 min-h-14 border-t border-line"><span><span className="text-base font-bold">Matched</span><span className="block text-xs text-muted">receipt linked to its charge</span></span><span className="text-2xl font-bold text-green">{matchedCount}</span></Link>
      </section>

      <Section title="Needs me" right={needsMe.length ? `${needsMe.length} open` : "all good"}>
        {routine && routine.total > 0 && (
          <Link href="/money/routine" className="card flex justify-between items-center gap-2 mb-2">
            <div><div className="text-[11px] font-bold tracking-wide text-accent">MONTHLY ROUTINE</div><div className="font-semibold text-sm">{routine.label}: {routine.done} of {routine.total} done</div>{routineOverdue > 0 && <div className="text-xs text-amber font-semibold">{routineOverdue} overdue</div>}</div>
            <span className="text-muted" aria-hidden>›</span>
          </Link>
        )}
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
            {needsMe.length > top.length && <Link href="/money/receipts" className="text-sm font-semibold text-accent px-1">and {needsMe.length - top.length} more</Link>}
          </div>
        )}
      </Section>

      <Section title="At a glance">
        <div className="grid grid-cols-2 gap-2">
          <div className="card"><div className="text-[11px] text-muted">Month to date</div><div className="font-semibold">{money(spent)}</div><div className="text-[11px] text-muted">{typical === null ? "no earlier months to compare yet" : `typical ${money(typical)} (last ${summary.priorMonths} month${summary.priorMonths === 1 ? "" : "s"})`}</div></div>
          <div className="card"><div className="text-[11px] text-muted">Cash across accounts</div>{hasBalances ? <><div className="font-semibold">{money(cash)}</div><div className="text-[11px] text-muted">as of last sync</div></> : <><div className="font-semibold text-muted">Not loaded</div><div className="text-[11px] text-muted">balances are not coming from Tiller yet</div></>}</div>
          <div className="card"><div className="text-[11px] text-muted">Statement closes</div>
            {accounts.filter((a) => a.kind === "credit").map((a) => { const n = closeIn(a.statement_close_day); return <div key={a.id} className="text-xs"><span className="font-semibold">••{a.last4}</span> {typeof n === "number" ? `in ${n} d` : "day not set"}</div>; })}
          </div>
          <div className="card"><div className="text-[11px] text-muted">Reconciled</div>{reconciled === null ? <><div className="font-semibold text-muted">Not started</div><div className="text-[11px] text-muted">no statements reconciled yet</div></> : <><div className={`font-semibold ${reconciled === 100 ? "text-green" : "text-amber"}`}>{reconciled}%</div><div className="text-[11px] text-muted">{behind.length ? `${behind.length} behind` : "all through last close"}</div></>}</div>
        </div>
        <div className="card mt-2 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><ProofDot state="green" /> {tx.length - red - amber}</span>
          <span className="flex items-center gap-1"><ProofDot state="amber" /> {amber}</span>
          <span className="flex items-center gap-1"><ProofDot state="red" /> {red}</span>
          <span className="text-muted">proof on the {tx.length} newest charges · closes cannot finish with red</span>
        </div>
      </Section>

      <Section title="This month" right="from your transactions">
        <div className="card flex flex-col gap-2">
          {cats.length === 0 ? <div className="text-sm text-muted">No spending recorded this month yet.</div> : cats.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-xs mb-1"><span className="font-semibold">{c.category}</span><span className={c.typical !== null && c.spent > c.typical ? "text-amber font-semibold" : "text-muted"}>{money(c.spent)} {c.typical !== null && <span className="text-muted">/ {money(c.typical)} typical</span>}</span></div>
              <Bar value={c.spent} max={Math.max(c.typical ?? 0, c.spent) || 1} tone={c.typical !== null && c.spent > c.typical ? "amber" : "accent"} />
            </div>
          ))}
          <div className="text-[11px] text-muted">{summary.charges} charges this month. Transfers, card payments and refunds are left out. Typical is the average of the last {summary.priorMonths || "0"} month{summary.priorMonths === 1 ? "" : "s"} that have enough charges{summary.priorMonths ? "" : ", so there is nothing to compare yet"}; months with missing Tiller data make it unreliable.</div>
        </div>
      </Section>

      <Section title="Accounts" right={<Link href="/money/accounts" className="font-semibold text-accent">Manage ›</Link>}>
        <div className="flex flex-col gap-2">
          {accounts.filter((a) => !a.retired_at).map((a) => (
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
        {recs.length === 0 && <div className="card text-sm text-muted">No reconciliations yet. They start once statements are loaded and tied to your transactions.</div>}
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
          <div className="flex justify-between"><span>{recurring.length === 0 ? "Nothing on the register yet" : `${recurring.length} items · about ${money(monthly)} a month`}</span></div>
          {nextSub && <div className="text-xs text-muted">Next charge: {nextSub.name} {money(nextSub.amount)} on {shortDate(nextSub.next_charge)}</div>}
          <div className="text-xs text-muted">{subs.filter((s) => s.decision === "cancel").length} cancel-prep task{subs.filter((s) => s.decision === "cancel").length === 1 ? "" : "s"} prepared · {recurring.filter((r) => r.ack_waiting).length} waiting on acknowledgement · {recurring.filter((r) => !r.on_register).length} not on the register</div>
          <div className="flex gap-3 mt-1"><Link href="/money/subscriptions" className="text-xs font-semibold text-accent">Subscriptions</Link><Link href="/money/recurring" className="text-xs font-semibold text-accent">Bills and charges</Link></div>
        </div>
      </Section>

      <Section title="Reports and tax">
        <div className="card flex flex-col text-sm">
          {[["Monthly close summaries", "#"], ["Year to date by category and entity", "#"], ["Tax year 2026 packet (per entity)", "/records?tax=2026"], ["Mileage and business trips", "#"], ["Export for the accountant", "#"], ["Resolved and history", "/money/receipts?view=history"]].map(([l, h]) => h === "#" ? (
            <div key={l} className="flex justify-between min-h-11 items-center border-b border-line last:border-0 text-muted"><span>{l}</span><span className="text-xs">not built yet</span></div>
          ) : (
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
