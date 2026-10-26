"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmWeek } from "@/app/review/actions";

export function ConfirmWeek({ open }: { open: number }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const go = () => start(async () => {
    const r = await confirmWeek(open);
    if (!r.ok) setErr(("error" in r && r.error) || "That did not work."); else { setDone(true); router.refresh(); }
  });
  return (
    <div className="card flex flex-col gap-2">
      <div className="text-sm text-muted">{open === 0 ? "Nothing is waiting. Confirm and the week is filed." : `${open} item${open === 1 ? " is" : "s are"} still open above. You can confirm anyway; they stay on the list.`}</div>
      <button type="button" className="min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50" disabled={pending || done} onClick={go}>{done ? "Confirmed" : "Confirm the week"}</button>
      {err && <div className="text-red text-xs font-semibold">{err}</div>}
    </div>
  );
}
