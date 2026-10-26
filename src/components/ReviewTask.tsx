"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setTaskStatus } from "@/app/actions";

// A task overdue by more than a week, on the weekly review. Snooze and Drop go through setTaskStatus like
// everywhere else, so both are logged and a dropped task has its way back on the Done tab. Reassigning is
// on the task itself; the title links there.
export function ReviewTask({ id, title, daysLate }: { id: string; title: string; daysLate: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const act = (s: "snoozed" | "dismissed") => start(async () => {
    const r = await setTaskStatus(id, s);
    if (!r.ok) setErr(("error" in r && r.error) || "That did not work."); else router.refresh();
  });
  const b = "min-h-11 px-3 rounded-xl border border-line text-sm font-semibold disabled:opacity-50 flex-1";
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex gap-2.5 items-start">
        <Link href={`/tasks/${id}`} className="font-semibold text-sm leading-snug min-w-0 flex-1">{title}</Link>
        <span className="flex-none text-[11px] font-bold rounded-full px-2 py-0.5 bg-red-bg text-red whitespace-nowrap">{daysLate} days late</span>
      </div>
      <div className="flex gap-2">
        <button type="button" className={b} disabled={pending} onClick={() => act("snoozed")}>Snooze</button>
        <button type="button" className={b} disabled={pending} onClick={() => act("dismissed")}>Drop</button>
      </div>
      {err && <div className="text-red text-xs font-semibold">{err}</div>}
    </div>
  );
}
