"use client";
import { useState, useTransition } from "react";
import { answerCandidate } from "@/app/money/routine/actions";
import type { CandidateRow } from "@/lib/data-money-routine-learn";

const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function RoutineCandidates({ rows }: { rows: CandidateRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!rows.length) return null;
  const act = (key: string, yes: boolean) => start(async () => { setError(null); const r = await answerCandidate(key, yes); if (!r.ok) setError(r.error ?? "Could not save."); });
  return (
    <section className="mb-4">
      <div className="text-[11px] font-bold tracking-wide text-muted uppercase mb-1.5">Seen two months running</div>
      <div className="flex flex-col gap-2">
        {rows.map((c) => (
          <div key={c.key} className="card flex flex-col gap-1">
            <div className="font-semibold text-sm">{c.label}</div>
            <div className="text-xs text-muted">Done {c.times} times in {c.months.map(monthName).join(", ")}{c.typical_day ? `, usually around the ${c.typical_day}th` : ""}. Add it to the monthly list?</div>
            <div className="flex gap-2 mt-1">
              <button disabled={pending} onClick={() => act(c.key, true)} className="rounded-full bg-accent text-white px-3 py-1 text-xs font-semibold disabled:opacity-40">Yes, every month</button>
              <button disabled={pending} onClick={() => act(c.key, false)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold disabled:opacity-40">No</button>
            </div>
          </div>
        ))}
        {error && <p role="alert" className="text-xs text-red">{error}</p>}
      </div>
    </section>
  );
}
