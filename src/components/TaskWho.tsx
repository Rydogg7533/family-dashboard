"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskWho, takeTask } from "@/app/actions";

// Who a task is for, and the heads-up copy. "Both" = either may finish it and it closes for both.
export function TaskWho({ id, label, mine, headsUp, otherName, canTake }: { id: string; label: string; mine: boolean; headsUp: boolean; otherName: string; canTake: boolean }) {
  const [open, setOpen] = useState(false);
  const [hu, setHu] = useState(headsUp);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error ?? "That did not work."); else { setErr(null); setOpen(false); router.refresh(); } });
  const b = "min-h-9 px-3 rounded-full border border-line text-xs font-semibold disabled:opacity-50";
  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted">{label}</span>
        {canTake && <button className={`${b} bg-accent text-white border-accent`} disabled={pending} onClick={() => run(() => takeTask(id))}>Take it</button>}
        <button className="font-semibold text-accent min-h-8" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Change who"}</button>
      </div>
      {open && (
        <div className="mt-1 flex flex-col gap-2 rounded-xl border border-line p-2">
          <div className="flex gap-1.5 flex-wrap">
            <button className={b} disabled={pending} onClick={() => run(() => setTaskWho(id, "me", hu))}>Just me</button>
            <button className={b} disabled={pending} onClick={() => run(() => setTaskWho(id, "other", hu))}>{otherName}</button>
            <button className={b} disabled={pending} onClick={() => run(() => setTaskWho(id, "both", false))}>Both of us</button>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={hu} onChange={(e) => setHu(e.target.checked)} /> Also give {mine ? otherName : "the other person"} a heads-up (for “Just me” or “{otherName}”)</label>
          <div className="text-muted">“Both of us”: either can finish it, and it closes for both.</div>
        </div>
      )}
      {err && <div className="text-red font-semibold mt-1">{err}</div>}
    </div>
  );
}
