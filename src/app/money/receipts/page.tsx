import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section, OpenIn, TxCard, ProofDot } from "@/components/money";
import { ChargeResolver, ReceiptAsk, BulkDrop, CardPicker, SubjectPicker } from "@/components/ReceiptTools";
import { getAccounts, getTransactions, getReceipts, getProofs, getSubjects, proofState, money, shortDate } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function Receipts({ searchParams }: PageProps<"/money/receipts">) {
  const sp = await searchParams;
  const forId = typeof sp.for === "string" ? sp.for : null;
  const mode = typeof sp.do === "string" ? sp.do : null;
  const itemId = typeof sp.item === "string" ? sp.item : null;
  const history = sp.view === "history";
  const [accounts, tx, receipts, proofs, subj] = await Promise.all([getAccounts(), getTransactions(), getReceipts(), getProofs(), getSubjects()]);
  const target = forId ? tx.find((t) => t.id === forId) : null;
  const asks = receipts.filter((r) => r.status === "needs_info");
  const queue = tx.filter((t) => proofState(t.id, proofs).state !== "green" && t.status !== "transfer");
  const expecting = receipts.filter((r) => r.status === "expecting_charge");
  const knownCards = Array.from(new Set([...accounts.filter((a) => !a.retired_at && a.kind !== "checking" && a.kind !== "savings").map((a) => `${a.institution} ${a.last4}`), ...receipts.map((r) => r.card).filter((c): c is string => !!c && c !== "Cash")]));
  const matched = receipts.filter((r) => r.status === "matched");
  const resolved = matched.length, total = matched.length + asks.length + expecting.length + queue.length;

  if (history) return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1>Resolved and history</H1>
      <p className="text-xs text-muted mb-3">Every transaction with its receipt link, category, entity, and who answered what. Searchable in Tiller and in the Finance folders.</p>
      <div className="flex flex-col gap-2">{tx.map((t) => <TxCard key={t.id} tx={t} proofs={proofs} accounts={accounts} compact />)}</div>
    </>
  );

  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1 right={`${resolved} of ${total} resolved`}>Receipts</H1>
      <p className="text-xs text-muted mb-3">Three layers, in order: found for you (email, inbox, files, ±3 days), a photo at purchase, the statement line as the minimum. No purchase without proof.</p>

      {target && <div className="mb-4"><ChargeResolver tx={target} mode={mode} /></div>}

      <Section title="Needs an answer" right={`${asks.length}`}>
        {asks.length === 0 ? <div className="card text-muted text-sm">Nothing waiting on you from the financial inbox.</div> : <div className="flex flex-col gap-2">{asks.map((r) => <div key={r.id} className={itemId === r.id ? "ring-2 ring-accent rounded-2xl" : ""}><ReceiptAsk r={r} /></div>)}</div>}
      </Section>

      <Section title="Matching queue" right={`${queue.length} without full proof`}>
        {queue.length === 0 ? <div className="card text-muted text-sm">Every charge has a digital receipt and a photo.</div> : (
          <div className="flex flex-col gap-2">
            {queue.slice(0, 5).map((t) => <TxCard key={t.id} tx={t} proofs={proofs} accounts={accounts} />)}
            {queue.length > 5 && <Link href="/money/receipts?view=history" className="text-sm font-semibold text-accent px-1">and {queue.length - 5} more</Link>}
          </div>
        )}
      </Section>

      <Section title="Expecting a charge" right={`${expecting.length}`}>
        {expecting.length === 0 ? <div className="card text-muted text-sm">No receipts waiting for their charge.</div> : (
          <div className="flex flex-col gap-2">{expecting.map((r) => (
            <div key={r.id} className="card flex flex-col gap-1"><div className="flex justify-between text-sm"><span className="font-semibold">{r.merchant}</span><span>{money(r.amount)}</span></div><div className="text-xs text-muted">{r.captured_by} · {shortDate(r.date)} · matches when the statement line arrives{r.home_path ? <> · filed at {r.home_path.replace(/^.*\/Organized\//, "Organized/")}</> : " · filed by card and month once you say which card"}</div><CardPicker r={r} known={knownCards} /><SubjectPicker r={r} subjects={subj.subjects} linked={subj.links.filter((l) => l.receipt_id === r.id).map((l) => l.subject_id)} /></div>
          ))}</div>
        )}
      </Section>

      <Section title="Financial inbox" right="bulk drop">
        <div className="card"><BulkDrop /></div>
      </Section>

      <Section title="Recently matched" right={<OpenIn label="Files" />}>
        <div className="card flex flex-col text-sm">{matched.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-2 border-b border-line last:border-0"><ProofDot state={proofState(r.transaction_id ?? "", proofs).state} /><div className="min-w-0 flex-1"><div className="font-semibold">{r.merchant} {money(r.amount)}</div><div className="text-xs text-muted truncate">{r.captured_by} · {r.file_path}</div></div></div>
        ))}</div>
      </Section>
    </>
  );
}
