"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setIssueStatus } from "@/app/issues/actions";

const OPTIONS: [string, string][] = [["fixed", "Fixed"], ["open", "Open"], ["needs_info", "Needs info"], ["cannot_reproduce", "Can't reproduce"], ["by_design", "By design"], ["duplicate", "Duplicate"]];

export default function IssueStatus({ id, status, note, fixedIn }: { id: string; status: string; note: string | null; fixedIn: string | null }) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(status === "open" ? "fixed" : status);
  const [n, setN] = useState(note ?? "");
  const [f, setF] = useState(fixedIn ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 min-h-11 px-4 rounded-xl bg-soft text-xs font-semibold">Update status</button>;
  const save = () => { setErr(null); start(async () => { try { const r = await Promise.race([setIssueStatus(id, st, n, f), new Promise<never>((_, j) => setTimeout(() => j(new Error("t")), 20000))]); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } setOpen(false); router.refresh(); } catch { setErr("That took too long. Try again."); } }); };
  const fld = "w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-sm";
  return (
    <div className="mt-2 flex flex-col gap-2">
      <select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)} className={fld}>{OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input aria-label="Note for the reporter" value={n} onChange={(e) => setN(e.target.value)} placeholder="Note for the reporter" maxLength={500} className={fld} />
      <input aria-label="Fixed in version" value={f} onChange={(e) => setF(e.target.value)} placeholder="Fixed in (commit, optional)" maxLength={40} className={fld} />
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 text-sm font-semibold">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex-1 min-h-11 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-60">{busy ? "Working…" : "Save"}</button>
        <button onClick={() => setOpen(false)} disabled={busy} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold">Cancel</button>
      </div>
    </div>
  );
}
