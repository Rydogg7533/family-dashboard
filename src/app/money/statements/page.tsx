import Link from "next/link";
import { H1 } from "@/components/ui";
import { StatementUpload } from "@/components/c/StatementUpload";
import { StatementAssign } from "@/components/c/StatementAssign";
import { getStatementsView, type StatementUpload as Upload } from "@/lib/data-statements";
import { accountLabel, type AccountRow } from "@/lib/statement-match";

export const dynamic = "force-dynamic";

// Statements never go to an AI service. They are stored privately for owners, read on the Mac mini with its own text reader, and only the
// shape of what it found (account, month, whether the arithmetic ties) comes back here.

const PILL: Record<Upload["status"], { text: string; cls: string }> = {
  uploaded: { text: "Waiting for the Mac mini", cls: "bg-amber-bg text-amber" },
  reading: { text: "Reading", cls: "bg-amber-bg text-amber" },
  read: { text: "Filed", cls: "bg-green-bg text-green" },
  needs_account: { text: "Needs account or month", cls: "bg-amber-bg text-amber" },
  failed: { text: "Could not read", cls: "bg-red-bg text-red" },
};
const Pill = ({ status }: { status: Upload["status"] }) => <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PILL[status].cls}`}>{PILL[status].text}</span>;
const FileLink = ({ id }: { id: string }) => <a href={`/api/statement-file/${id}`} target="_blank" rel="noopener" className="text-xs font-semibold text-accent">Open file ›</a>;

function accountText(accounts: AccountRow[], id: string | null) {
  const a = accounts.find((x) => x.id === id);
  return a ? accountLabel(a) : "Account not set";
}

export default async function Statements() {
  const v = await getStatementsView();
  const back = <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>;
  if (!v.isOwner) {
    return (
      <>
        {back}
        <H1>Statements</H1>
        <div className="card text-sm text-muted">Only a household owner can upload or open statements.</div>
      </>
    );
  }

  const needsMe = v.uploads.filter((u) => u.status === "needs_account" || u.status === "failed");
  const rest = v.uploads.filter((u) => u.status !== "needs_account" && u.status !== "failed");
  const pending = v.uploads.some((u) => u.status === "uploaded" || u.status === "reading");
  const SHOW = 5;

  return (
    <>
      {back}
      <H1 right={needsMe.length ? `${needsMe.length} need${needsMe.length === 1 ? "s" : ""} you` : undefined}>Statements</H1>
      <p className="text-sm text-muted mb-3">Drop a bank or card statement here. It is stored privately (owners only) and read on the Mac mini with its own text reader, so no AI service ever sees it. The app keeps only which account and month it is, and whether the totals add up. If the Mac mini is off, the statement waits.</p>

      {needsMe.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {needsMe.slice(0, SHOW).map((u) => (
            <div key={u.id} className="card">
              <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold break-all">{u.original_name}</div><Pill status={u.status} /></div>
              {u.status === "needs_account" ? (
                <>
                  <div className="text-xs text-muted mt-1">The reader could not tell {u.account_id ? "the month" : u.period ? "which account" : "which account or month"} this is for{u.missing.length ? ` (not found: ${u.missing.map((m) => m.replace(/_/g, " ")).join(", ")})` : ""}.</div>
                  <StatementAssign id={u.id} accounts={v.accounts} guessAccountId={u.account_id} guessPeriod={u.period} />
                </>
              ) : (
                <div className="text-xs text-muted mt-1">{u.error ?? "The reader could not use this file."} Upload a clearer scan, or the original PDF from the bank&apos;s site.</div>
              )}
              <div className="mt-2"><FileLink id={u.id} /></div>
            </div>
          ))}
          {needsMe.length > SHOW && <div className="text-xs text-muted">and {needsMe.length - SHOW} more</div>}
        </div>
      )}

      <div className="mb-3"><StatementUpload pending={pending} /></div>

      <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Uploaded</div>
      {rest.length === 0 ? <div className="card text-sm text-muted">Nothing uploaded yet.</div> : (
        <div className="card flex flex-col text-sm">
          {rest.slice(0, 20).map((u) => (
            <div key={u.id} className="py-2 border-b border-line last:border-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{u.status === "read" ? `${u.period ?? ""} ${accountText(v.accounts, u.account_id)}`.trim() : u.original_name}</div>
                <Pill status={u.status} />
              </div>
              {u.status === "read" && (
                <div className="text-xs text-muted mt-0.5">
                  {u.tie_ok === true && <span className="text-green font-semibold">Totals add up</span>}
                  {u.tie_ok === false && <span className="text-amber font-semibold">Check the totals</span>}
                  {u.tie_ok === null && <span>Totals not checked</span>}
                  {u.tie_note && u.tie_ok === false ? ` · ${u.tie_note}` : ""}
                  {u.local_copy ? " · copy filed on the Mac mini" : ""}
                </div>
              )}
              <div className="mt-1"><FileLink id={u.id} /></div>
            </div>
          ))}
          {rest.length > 20 && <div className="text-xs text-muted pt-2">and {rest.length - 20} more</div>}
        </div>
      )}
      <p className="text-[11px] text-muted mt-3">Opening a file gives a link that works for five minutes. Statements are never deleted from here.</p>
    </>
  );
}
