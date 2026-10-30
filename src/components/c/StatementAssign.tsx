"use client";
// The reader could not tell which account or month a statement is for. An owner says; the Mac mini finishes the filing on its next run.
// Account choices come from the accounts register (institution and last four digits only).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignStatement } from "@/app/money/statements/actions";
import { accountLabel, type AccountRow } from "@/lib/statement-match";

export function StatementAssign({ id, accounts, guessAccountId, guessPeriod }: { id: string; accounts: AccountRow[]; guessAccountId: string | null; guessPeriod: string | null }) {
  const router = useRouter();
  const [account, setAccount] = useState(guessAccountId ?? "");
  const [period, setPeriod] = useState(guessPeriod ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const field = "min-h-10 px-3 rounded-xl border border-line bg-transparent text-sm";

  async function save() {
    setBusy(true); setMsg("");
    const r = await assignStatement(id, account, period.trim());
    setBusy(false);
    if (r.ok) { setMsg("Saved. The Mac mini will file it shortly."); router.refresh(); } else setMsg(r.reason);
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <select className={field} value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
        <option value="">Which account?</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
      </select>
      <input className={field} inputMode="numeric" placeholder="Month, like 2026-10" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Statement month" />
      <button type="button" onClick={save} disabled={busy || !account || !period.trim()} className="min-h-10 px-3 rounded-xl bg-soft text-sm font-semibold disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
      {msg && <div className="text-xs text-muted">{msg}</div>}
    </div>
  );
}
