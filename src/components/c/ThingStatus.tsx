"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setThingStatus } from "@/app/things/actions";
import { STATUS_LABEL, GONE, type ThingStatus } from "@/lib/things-shared";

// Nothing is deleted: an item leaves the "have it" list with a reason and a date, and can come back.
export function ThingStatus({ id, status }: { id: string; status: ThingStatus }) {
  const [pick, setPick] = useState<ThingStatus | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  async function go(s: ThingStatus, n?: string) { setBusy(true); setErr(null); const r = await setThingStatus(id, s, n); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } setPick(null); setNote(""); router.refresh(); }
  if (status !== "active") return <div><button disabled={busy} onClick={() => go("active")} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold">Mark as “have it” again</button>{err && <div className="text-sm text-red font-semibold mt-1">{err}</div>}</div>;
  return (
    <div className="flex flex-col gap-2">
      {!pick && <div className="flex gap-2 flex-wrap">{GONE.map((s) => <button key={s} onClick={() => setPick(s)} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold">{STATUS_LABEL[s]}</button>)}</div>}
      {pick && (
        <div className="rounded-xl border border-line p-3 flex flex-col gap-2">
          <div className="text-sm font-semibold">Mark as: {STATUS_LABEL[pick]}</div>
          <input className="w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm" placeholder="Note (to whom, for how much, where)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2"><button disabled={busy} onClick={() => go(pick, note)} className="flex-1 min-h-10 rounded-xl bg-accent text-white text-sm font-semibold">Confirm</button><button onClick={() => setPick(null)} className="min-h-10 px-4 rounded-xl border border-line text-sm font-semibold">Cancel</button></div>
          <div className="text-[11px] text-muted">It stays in your catalog with this date. You can bring it back any time.</div>
        </div>
      )}
      {err && <div className="text-sm text-red font-semibold">{err}</div>}
    </div>
  );
}
