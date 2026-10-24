"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissSetupStep } from "@/app/settings/connections/actions";
import type { StepKey } from "@/lib/connections-steps";

// One set-up step at a time on Today. "Not now" hides it for a week.
export default function SetupCard({ step, label, detail, href, state, done, total }: { step: StepKey; label: string; detail: string; href: string; state: "todo" | "needs"; done: number; total: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const later = () => { setErr(null); start(async () => { try { const r = await dismissSetupStep(step); if (!r.ok) { setErr(r.error); return; } router.refresh(); } catch { setErr("That took too long. Try again."); } }); };
  return (
    <div className="card mb-4 border-accent">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{state === "needs" ? `${label} needs attention` : `Next: set up ${label.toLowerCase()}`}</div>
        <div className="text-xs text-muted shrink-0">{done} of {total} connected</div>
      </div>
      <div className="text-xs text-muted mt-1">{detail}</div>
      {err && <div role="alert" className="text-xs text-red font-semibold mt-1">{err}</div>}
      <div className="flex gap-2 mt-3">
        <Link href={href} className="flex-1 min-h-11 grid place-items-center rounded-xl bg-accent text-white text-sm font-semibold">{state === "needs" ? "Fix it" : "Set up"}</Link>
        <button type="button" disabled={busy} onClick={later} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-60">{busy ? "…" : "Not now"}</button>
      </div>
    </div>
  );
}
