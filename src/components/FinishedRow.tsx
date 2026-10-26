"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoTaskStatus } from "@/app/actions";
import type { Task } from "@/lib/data";

// A finished task, with the way back. Done is almost always a person saying the job happened, since the
// app cannot watch most of them -- so a mistap, or a job that turned out not to be finished, has to be
// reversible. Where the app DID see evidence, the row says so instead of naming a person.
export function FinishedRow({ task }: { task: Task }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const put = () => start(async () => {
    const r = await undoTaskStatus(task.id);
    if (!r.ok) setErr(r.error ?? "That did not work."); else { setErr(null); router.refresh(); }
  });
  const when = task.updated_at ? new Date(task.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const how = task.status === "dismissed" ? "Dismissed"
    : task.done_by === "System" ? "Done — the app saw it happen"
    : task.done_by ? `${task.done_by} marked it done`
    : "Marked done";
  return (
    <div className="card flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm leading-snug line-clamp-2">{task.title}</div>
        <div className="text-xs text-muted mt-1">{how}{when && <> &middot; {when}</>}</div>
        {err && <div className="text-red text-xs font-semibold mt-1">{err}</div>}
      </div>
      <button type="button" className="min-h-11 flex-none px-3 rounded-xl border border-line text-sm font-semibold disabled:opacity-50" disabled={pending} onClick={put}>Put back</button>
    </div>
  );
}
