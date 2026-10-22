"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskStatus } from "@/app/actions";

export function TaskActions({ id, kind }: { id: string; kind: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (status: "done" | "snoozed" | "dismissed") => start(async () => { await setTaskStatus(id, status); router.refresh(); });
  const btn = "min-h-11 px-3 rounded-xl border border-line font-semibold text-sm disabled:opacity-50";
  return (
    <div className="flex gap-2">
      {kind === "sub" ? (
        // a "Subscription?" task is answered on its own page (amount and how often), so a bare Yes/No can't close it without recording anything
        <button className={`${btn} flex-1 bg-accent text-white border-accent`} disabled={pending} onClick={() => router.push(`/tasks/${id}`)}>Answer</button>
      ) : kind === "snooze" ? null : kind === "decide" ? (
        <>
          <button className={`${btn} flex-1`} disabled={pending} onClick={() => act("done")}>Yes</button>
          <button className={`${btn} flex-1`} disabled={pending} onClick={() => act("dismissed")}>No</button>
        </>
      ) : (
        <button className={`${btn} flex-1 bg-accent text-white border-accent`} disabled={pending} onClick={() => act("done")}>Done</button>
      )}
      <button className={btn} disabled={pending} onClick={() => act("snoozed")}>Snooze</button>
    </div>
  );
}
