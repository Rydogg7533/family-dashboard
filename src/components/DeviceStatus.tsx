"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeviceStatus } from "@/app/devices/actions";

// Retiring is a confirmed step (tier 2): one tap asks, the second does it. It is reversible, and nothing is deleted.
export function DeviceStatus({ id, status, name }: { id: string; status: string; name: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const retired = status === "retired" || status === "lost" || status === "for sale";

  const go = (next: string) => start(async () => {
    const r = await setDeviceStatus(id, next);
    setAsk(null);
    if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
    setErr(null); router.refresh();
  });

  if (ask) return (
    <div className="card mt-4 flex flex-col gap-2">
      <div className="text-sm font-semibold">Mark {name} as {ask}?</div>
      <div className="text-xs text-muted">It moves to history and stays in the register. You can bring it back.</div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => go(ask)} className="min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">{busy ? "Saving…" : "Yes"}</button>
        <button disabled={busy} onClick={() => setAsk(null)} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="mt-4 flex flex-col gap-2">
      {err && <div className="rounded-xl bg-red-bg text-red px-4 py-3 text-sm font-semibold">{err}</div>}
      <div className="flex gap-2 flex-wrap">
        {retired ? (
          <button disabled={busy} onClick={() => go("in use")} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Back in use</button>
        ) : (
          <>
            <button disabled={busy} onClick={() => setAsk("retired")} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Retire</button>
            <button disabled={busy} onClick={() => setAsk("for sale")} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">For sale</button>
            <button disabled={busy} onClick={() => setAsk("lost")} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Lost</button>
          </>
        )}
      </div>
    </div>
  );
}
