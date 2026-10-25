"use client";
import { useRef, useState } from "react";
import { getDetailsProgress, readDetailsBatch } from "@/app/settings/money/details-actions";

// Reads the older receipts and bills for Covers / Period / Reference. Three at a time; stop any time; it adds those three fields and changes nothing else.
export function ReceiptDetailsBackfill({ initial }: { initial: { total: number; done: number } }) {
  const [p, setP] = useState(initial);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const left = p.total - p.done;

  async function go() {
    stop.current = false; setRunning(true); setError(null);
    let bad = failed;
    for (let guard = 0; guard < 60 && !stop.current; guard++) {
      const r = await readDetailsBatch(bad).catch(() => null);
      if (!r) { setError("The call did not finish. Try again."); break; }
      if (!r.ok) { setError(r.error); break; }
      bad = [...bad, ...r.failed]; setFailed(bad);
      const fresh = await getDetailsProgress().catch(() => null);
      if (fresh) setP(fresh);
      if (r.remaining === 0 || (r.read === 0 && r.failed.length === 0)) break;
    }
    setRunning(false);
  }

  return (
    <div className="card mt-3">
      <div className="font-semibold">Receipt details</div>
      <p className="text-xs text-muted mt-1">New receipts are now read for what they paid for: <b>Covers</b> (the account, workspace or plan), <b>Period</b> and <b>Reference</b>. This reads the older ones once more. It only adds those three fields; answers, files and receipts are not touched, and card or account numbers are never kept. A small model cost per document.</p>
      <div className="mt-2 text-sm"><b>{p.done}</b> of <b>{p.total}</b> older documents read{left > 0 ? `, ${left} to go` : ", all done"}.</div>
      {failed.length > 0 && <div className="text-xs text-amber mt-1">{failed.length} could not be read (unreadable file); left as they are.</div>}
      <div className="flex gap-2 mt-2">
        {!running && left > failed.length && <button onClick={go} className="min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold">{p.done > 0 ? "Keep going" : "Read the older ones"}</button>}
        {running && <button onClick={() => { stop.current = true; }} className="min-h-11 px-4 rounded-xl border border-line text-sm font-semibold">Stop after this one</button>}
        {running && <span className="text-xs text-muted self-center animate-pulse">Reading…</span>}
      </div>
      {error && <p role="alert" className="text-xs text-red mt-1">{error}</p>}
    </div>
  );
}
