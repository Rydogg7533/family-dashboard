"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissCatalogCard } from "@/app/things/catalog-actions";

// Today card for the long "catalog what you own" task. "Not now" hides it for a week.
export default function CatalogCard({ started, done, total, next }: { started: boolean; done: number; total: number; next: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card mb-4 border-accent">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{started ? "Keep cataloging what you own" : "Next: catalog what you own"}</div>
        {started && total > 0 && <div className="text-xs text-muted shrink-0">{done} of {total} areas done</div>}
      </div>
      <div className="text-xs text-muted mt-1">{started ? (next ? `Next area: ${next}. A few minutes at a time is fine; it keeps your place.` : "Every area is marked done. Run the final check to finish.") : "Pick the rooms, then photograph things one room at a time. It takes a few minutes per room, over as many days as you like, and it keeps your place."}</div>
      {err && <div role="alert" className="text-xs text-red font-semibold mt-1">{err}</div>}
      <div className="flex gap-2 mt-3">
        <Link href="/things/catalog" className="flex-1 min-h-11 grid place-items-center rounded-xl bg-accent text-white text-sm font-semibold">{started ? "Continue" : "Start"}</Link>
        <button type="button" disabled={busy} onClick={() => { setErr(null); start(async () => { const r = await dismissCatalogCard(); if (!r.ok) setErr(r.error ?? "Try again."); else router.refresh(); }); }} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-60">{busy ? "…" : "Not now"}</button>
      </div>
    </div>
  );
}
