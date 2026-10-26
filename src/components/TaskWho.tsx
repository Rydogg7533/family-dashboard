"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskWho, takeTask } from "@/app/actions";

// Who a task is for. The trigger is a small button beside Done and Snooze rather than a "Change who"
// link on every card: with 61 open tasks that was 61 copies of a control used rarely. Who the task is
// for now reads in the card's meta line in one word, so this only has to offer the change.
export function TaskWho({ id, mine, headsUp, otherName, canTake }: { id: string; mine: boolean; headsUp: boolean; otherName: string; canTake: boolean }) {
  const [open, setOpen] = useState(false);
  const [hu, setHu] = useState(headsUp);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error ?? "That did not work."); else { setErr(null); setOpen(false); router.refresh(); } });
  const b = "min-h-11 px-3 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
  return (
    <div className="relative flex gap-2">
      {canTake && <button className={`${b} bg-accent text-white border-accent`} disabled={pending} onClick={() => run(() => takeTask(id))}>Take it</button>}
      <button className={`${b} w-11 text-muted`} aria-label="Who this task is for" aria-expanded={open} disabled={pending} onClick={() => setOpen((v) => !v)}>&middot;&middot;&middot;</button>
      {open && (
        <div className="absolute right-0 top-12 z-10 w-64 flex flex-col gap-2 rounded-xl border border-line bg-bg p-2 text-xs">
          <div className="flex gap-1.5 flex-wrap">
            <button className={b} disabled={pending} onClick={() => run(() => setTaskWho(id, "me", hu))}>Just me</button>
            <button className={b} disabled={pending} onClick={() => run(() => setTaskWho(id, "other", hu))}>{otherName}</button>
            <button className={b} disabled={pending} onClick={() => run(() => setTaskWho(id, "both", false))}>Household</button>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={hu} onChange={(e) => setHu(e.target.checked)} /> Also give {mine ? otherName : "the other person"} a heads-up</label>
          <div className="text-muted">&ldquo;Household&rdquo;: either of you can finish it, and it closes for both.</div>
          {err && <div className="text-red font-semibold">{err}</div>}
        </div>
      )}
    </div>
  );
}
