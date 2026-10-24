"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissGuidedCard } from "@/app/settings/sitter/actions";

// Today card for a long, resumable set-up task (catalog what you own, sitter sheet). "Not now" hides it for a week.
export default function GuidedCard({ step, title, progress, body, href, startLabel }: { step: "catalog" | "sitter_sheet"; title: string; progress?: string; body: string; href: string; startLabel: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card mb-4 border-accent">
      <div className="flex items-baseline justify-between gap-2"><div className="font-semibold">{title}</div>{progress && <div className="text-xs text-muted shrink-0">{progress}</div>}</div>
      <div className="text-xs text-muted mt-1">{body}</div>
      {err && <div role="alert" className="text-xs text-red font-semibold mt-1">{err}</div>}
      <div className="flex gap-2 mt-3">
        <Link href={href} className="flex-1 min-h-11 grid place-items-center rounded-xl bg-accent text-white text-sm font-semibold">{startLabel}</Link>
        <button type="button" disabled={busy} onClick={() => { setErr(null); start(async () => { const r = await dismissGuidedCard(step); if (!r.ok) setErr(r.error ?? "Try again."); else router.refresh(); }); }} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-60">{busy ? "…" : "Not now"}</button>
      </div>
    </div>
  );
}
