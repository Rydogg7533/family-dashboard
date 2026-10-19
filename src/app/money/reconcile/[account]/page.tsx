import Link from "next/link";
import { notFound } from "next/navigation";
import { H1 } from "@/components/ui";
import { Section, OpenIn, SyncLine, Bar, TxCard } from "@/components/money";
import { getAccounts, getTransactions, getReconciliations, getProofs, money, shortDate, daysUntil, accountLabel, proofState } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function Reconcile({ params }: PageProps<"/money/reconcile/[account]">) {
  const { account } = await params;
  const [accounts, tx, recs, proofs] = await Promise.all([getAccounts(), getTransactions(), getReconciliations(), getProofs()]);
  const acc = accounts.find((a) => a.id === account);
  if (!acc) notFound();
  const mine = tx.filter((t) => t.account_id === acc.id);
  const open = recs.filter((r) => r.account_id === acc.id && r.status !== "done");
  const history = recs.filter((r) => r.account_id === acc.id && r.status === "done");
  const red = mine.filter((t) => proofState(t.id, proofs).state === "red");
  const toExplain = mine.filter((t) => t.status === "unknown" || t.flag);
  const canClose = red.length === 0 && toExplain.length === 0;

  const steps = (r: typeof recs[number]) => r.kind === "card"
    ? ["Statement lines vs ledger, every line accounted for", "Differences listed (missing, duplicate, mismatch, unknown)", "Interest, fees and promotional terms checked", "Payment matched to statement balance and due date", "Every charge has a receipt or an explanation", "Statement PDF filed; close marked done"]
    : ["Statement lines vs ledger", "Beginning + deposits − withdrawals = ending balance", "Outstanding items listed (checks, pending transfers)", "Transfers matched both sides", "Fees and interest flagged; deposits matched to expected income", "Statement PDF filed; close marked done"];

  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1>{accountLabel(acc)}</H1>
      <div className="text-xs text-muted mb-4"><SyncLine at={acc.synced_at} /><br />{acc.owner} · {acc.entity} · {acc.kind}{acc.statement_close_day ? ` · closes the ${acc.statement_close_day}` : ""}{acc.due_day ? ` · due the ${acc.due_day}` : ""}{acc.autopay ? " · autopay on" : ""}{acc.vault_item ? ` · login: ${acc.vault_item}` : ""} · <OpenIn label="Tiller" /></div>

      {open.length === 0 ? <div className="card text-green font-semibold mb-5">Reconciled through the last statement. Nothing to close.</div> : open.map((r) => (
        <Section key={r.id} title={`${r.period} close`} right={r.due_at ? (daysUntil(r.due_at) < 0 ? "overdue" : `due ${shortDate(r.due_at)}`) : undefined}>
          <div className="card flex flex-col gap-2">
            <Bar value={r.tied_lines} max={r.total_lines} tone={r.status === "exceptions" ? "red" : "amber"} />
            <div className="text-sm">{r.tied_lines} of {r.total_lines} lines tied · <span className="text-amber font-semibold">{r.to_explain} to explain</span>{r.statement_total ? ` · statement ${money(r.statement_total)}` : ""}</div>
            {r.tie_out && (
              <div className="text-xs rounded-xl bg-soft p-2.5">
                <div className="font-semibold mb-1">Balance tie-out</div>
                <div className="grid grid-cols-2 gap-x-2">
                  <span className="text-muted">Opening</span><span className="text-right">{money(r.tie_out.opening)}</span>
                  <span className="text-muted">+ Deposits</span><span className="text-right">{money(r.tie_out.deposits)}</span>
                  <span className="text-muted">− Withdrawals</span><span className="text-right">{money(r.tie_out.withdrawals)}</span>
                  <span className="font-semibold">= Closing</span><span className={`text-right font-semibold ${r.tie_out.ok ? "text-green" : "text-red"}`}>{money(r.tie_out.closing)} {r.tie_out.ok ? "ties" : "does not tie"}</span>
                </div>
              </div>
            )}
            <ol className="text-xs text-muted flex flex-col gap-0.5 list-decimal pl-4">{steps(r).map((s, i) => <li key={s} className={i < Math.round((r.tied_lines / r.total_lines) * steps(r).length) ? "text-green" : ""}>{s}</li>)}</ol>
            {r.statement_file ? <div className="text-xs text-muted">Statement: {r.statement_file} · <OpenIn label="Files" /></div> : <div className="text-xs text-amber font-semibold">Statement PDF not yet received. <Link href="/inbox?capture=file" className="underline">Upload it</Link> or wait for the email.</div>}
            <div className="flex gap-2 mt-1">
              <button disabled={!canClose} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-40">Mark close done</button>
              <button disabled={red.length > 0} className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm disabled:opacity-40">Close with exceptions</button>
            </div>
            <div className="text-[11px] text-muted">{red.length > 0 ? `${red.length} charge${red.length === 1 ? "" : "s"} with no proof: a close cannot finish, even with exceptions, until each has a receipt, a photo, or at least its statement line and an explanation.` : toExplain.length ? `${toExplain.length} to explain before a clean close; "Close with exceptions" records the reason for each.` : "Everything ties. Marking done files the statement and writes the one-line summary."}</div>
          </div>
        </Section>
      ))}

      <Section title="To explain" right={`${toExplain.length} on this account`}>
        {toExplain.length === 0 ? <div className="card text-muted text-sm">Every line on this account has a receipt or an explanation.</div> : <div className="flex flex-col gap-2">{toExplain.map((t) => <TxCard key={t.id} tx={t} proofs={proofs} accounts={accounts} />)}</div>}
      </Section>

      <Section title="Ledger" right="this period">
        <div className="flex flex-col gap-2">{mine.filter((t) => !toExplain.includes(t)).map((t) => <TxCard key={t.id} tx={t} proofs={proofs} accounts={accounts} compact />)}</div>
        {mine.length === 0 && <div className="card text-muted text-sm">No transactions synced yet.</div>}
      </Section>

      {history.length > 0 && (
        <Section title="Statement history">
          <div className="card flex flex-col text-sm">{history.map((r) => <div key={r.id} className="py-2 border-b border-line last:border-0"><div className="font-semibold">{r.period}</div><div className="text-xs text-muted">{r.summary} · {r.statement_file ? <OpenIn label="Files" /> : "no PDF"}</div></div>)}</div>
        </Section>
      )}
      <p className="text-[11px] text-muted">Payment to this card is matched here, never made here. Tiller&apos;s own columns are never changed.</p>
    </>
  );
}
