import Link from "next/link";
import { notFound } from "next/navigation";
import { H1 } from "@/components/ui";
import { OpenIn, TxCard } from "@/components/money";
import { getRecords, getTransactions, getProofs, getAccounts, RECORD_KIND_LABEL, shortDate, daysUntil } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function RecordDetail({ params }: PageProps<"/records/[id]">) {
  const { id } = await params;
  const [records, tx, proofs, accounts] = await Promise.all([getRecords(), getTransactions(), getProofs(), getAccounts()]);
  const r = records.find((x) => x.id === id);
  if (!r) notFound();
  const linked = r.transaction_id ? tx.find((t) => t.id === r.transaction_id) : null;
  const days = r.needed_until ? daysUntil(r.needed_until) : null;
  const rows: [string, string][] = [
    ["For", r.for_person ?? "Family"],
    ["Confirmation", r.confirmation_number ?? "none on file"],
    ["Happens", r.happens_at ? shortDate(r.happens_at) : "—"],
    ["Needed until", r.needed_until ? `${shortDate(r.needed_until)}${days !== null && days >= 0 ? ` (${days} d)` : ""}` : "open"],
    ["Retention rule", r.retention_rule],
    ["File", r.file_ref ? `~/Organized/Personal/Documents/${r.file_ref}` : "no file; number only"],
    ["Tax", r.tax_year ? `Tax ${r.tax_year} (fed to Reports and tax)` : "not tax-related"],
    ["Added by", r.requested_by],
  ];

  return (
    <>
      <Link href="/records" className="text-xs font-semibold text-accent">‹ Records</Link>
      <H1>{r.title}</H1>
      <div className="flex gap-1.5 mb-3">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-soft">{RECORD_KIND_LABEL[r.kind]}</span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.status === "needed_soon" ? "bg-amber-bg text-amber" : r.status === "archived" ? "bg-soft text-muted" : "bg-green-bg text-green"}`}>{r.status.replace("_", " ")}</span>
      </div>

      {r.confirmation_number && (
        <div className="card mb-3 flex items-center justify-between gap-2">
          <div><div className="text-[11px] text-muted">Confirmation number</div><div className="text-2xl font-display font-extrabold tracking-wider">{r.confirmation_number}</div></div>
          <div className="flex flex-col gap-1.5">
            <button className="min-h-10 px-3 rounded-full bg-accent text-white text-xs font-semibold">Show at check-in</button>
            <button className="min-h-10 px-3 rounded-full border border-line text-xs font-semibold">Send to my phone</button>
          </div>
        </div>
      )}

      <div className="card mb-3 flex flex-col text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2 border-b border-line last:border-0"><span className="text-muted shrink-0">{k}</span><span className="text-right break-all min-w-0">{v}</span></div>)}
      </div>

      <div className="card mb-3 text-sm flex flex-col gap-1.5">
        <div className="font-semibold">Where it lives</div>
        <div className="text-xs text-muted">Original: <OpenIn label={r.source_name} href={r.source_href} /> · File: {r.file_ref ? <OpenIn label="Files" /> : "none"} · Shown on the calendar event as a chip and in the Day block on the day.</div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <Link href="/inbox?capture=photo" className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Add a photo</Link>
          <Link href="/inbox?capture=file" className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Attach a file</Link>
          <button className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold">Archive now</button>
        </div>
      </div>

      {linked && (
        <div className="mb-3">
          <div className="text-base font-display font-extrabold mb-2">Money event</div>
          <TxCard tx={linked} proofs={proofs} accounts={accounts} />
        </div>
      )}
      <p className="text-[11px] text-muted">Nothing is deleted; archive hides it from the working list. The dashboard stores the reference and metadata only.</p>
    </>
  );
}
