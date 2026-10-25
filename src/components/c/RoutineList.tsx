"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Toast, useToast } from "@/components/Toast";
import { setRoutineRun } from "@/app/money/routine/actions";
import type { RoutineItem } from "@/lib/data-money-routine";

const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function RoutineList({ items }: { items: RoutineItem[] }) {
  const [skipFor, setSkipFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast, show, clear } = useToast();

  const act = (runId: string, status: "done" | "skipped" | "open", why?: string, undoText?: string) => start(async () => {
    setError(null);
    const r = await setRoutineRun(runId, status, why);
    if (!r.ok) { setError(r.error ?? "Could not save."); return; }
    setSkipFor(null); setReason("");
    if (undoText) show(undoText, () => act(runId, "open"));
  });

  const open = items.filter((i) => (i.run?.status ?? "open") === "open");
  const closed = items.filter((i) => i.run && i.run.status !== "open");
  return (
    <div className="flex flex-col gap-2">
      {open.length === 0 && <div className="card text-muted text-sm">Everything on this month’s list is done or skipped.</div>}
      {open.map((i) => (
        <div key={i.id} className="card flex flex-col gap-1">
          <div className="flex justify-between gap-2 items-baseline">
            <div className="font-semibold text-sm">{i.label}</div>
            <span className={`text-[11px] shrink-0 ${i.overdue ? "text-amber font-bold" : "text-muted"}`}>{i.overdue ? "overdue · " : "by "}{shortDay(i.due)}</span>
          </div>
          {i.detail && <div className="text-xs text-muted">{i.detail}</div>}
          <div className="flex items-center gap-3 text-xs mt-1">
            <span className="text-muted">{i.owner === "either" ? "Either parent" : i.owner}</span>
            {i.href && <Link href={i.href} className="font-semibold text-accent">Open</Link>}
            {i.run && <button disabled={pending} onClick={() => act(i.run!.id, "done", undefined, `Done: ${i.label}`)} className="ml-auto rounded-full bg-accent text-white px-3 py-1 font-semibold disabled:opacity-40">Done</button>}
            {i.run && <button disabled={pending} onClick={() => { setSkipFor(skipFor === i.run!.id ? null : i.run!.id); setReason(""); }} className="rounded-full border border-line px-3 py-1 font-semibold">Skip</button>}
          </div>
          {i.run && skipFor === i.run.id && (
            <div className="flex gap-2 mt-1">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why, this month?" className="flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm" />
              <button disabled={pending || !reason.trim()} onClick={() => act(i.run!.id, "skipped", reason, `Skipped: ${i.label}`)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold disabled:opacity-40">Confirm skip</button>
            </div>
          )}
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-red">{error}</p>}
      {closed.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs font-semibold text-muted cursor-pointer">{closed.length} done or skipped this month</summary>
          <div className="flex flex-col gap-1 mt-2">
            {closed.map((i) => (
              <div key={i.id} className="card !py-2 flex justify-between items-center gap-2 text-xs">
                <div className="min-w-0"><span className="font-semibold">{i.label}</span><span className="text-muted"> · {i.run!.status === "done" ? "done" : `skipped: ${i.run!.skip_reason}`} by {i.run!.done_by}</span></div>
                <button disabled={pending} onClick={() => act(i.run!.id, "open")} className="text-accent font-semibold shrink-0">Reopen</button>
              </div>
            ))}
          </div>
        </details>
      )}
      <Toast toast={toast} onDone={clear} />
    </div>
  );
}
