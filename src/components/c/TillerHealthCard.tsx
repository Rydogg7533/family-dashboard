"use client";
import { useState, useTransition } from "react";
import { confirmNoActivity, undoNoActivity } from "@/app/money/routine/actions";
import type { TillerHealth } from "@/lib/tiller-health";

// The Tiller check, account by account. A failing account says what is wrong in plain words; the only thing a person can do in the app
// is confirm "no activity this month" (the real fix, re-linking the bank, happens in Tiller). Two taps, logged with who and when.
export function TillerHealthCard({ health, monthName }: { health: TillerHealth; monthName: string }) {
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setError(null); const r = await fn(); if (!r.ok) setError(r.error ?? "Could not save."); else setAsking(null); });
  const bad = health.failing.length > 0 || !health.syncOk;
  const confirmed = health.accounts.filter((a) => a.state === "confirmed");
  return (
    <div className={`card flex flex-col gap-2 mb-3 ${bad ? "!border-amber" : ""}`}>
      <div className="flex justify-between items-baseline gap-2">
        <div className="text-[11px] font-bold tracking-wide text-accent">TILLER CHECK</div>
        <div className={`text-sm font-bold ${bad ? "text-amber" : "text-green"}`}>{health.good} of {health.total} accounts good</div>
      </div>
      {!bad && <p className="text-xs text-muted m-0">Every Tiller account has delivered its charges through {monthName}. The steps that rely on complete charges are open.</p>}
      {bad && <p className="text-xs text-muted m-0">Until this is green, {monthName} cannot be closed and no receipt is called “never charged”. A quiet bank link looks the same as a quiet month, so each account is checked against its own history.</p>}
      {health.syncLine && <p role="alert" className="text-xs text-amber font-semibold m-0">{health.syncLine}</p>}
      {health.failing.map((a) => (
        <div key={a.id} className="rounded-xl border border-line p-3 flex flex-col gap-1">
          <div className="font-semibold text-sm">{a.label}</div>
          <div className="text-xs text-amber">{a.line}</div>
          <div className="text-[11px] text-muted">Fix: re-link this bank in Tiller, run Fill, then the sync. If it truly had no activity, say so below.</div>
          {asking !== a.id && <button disabled={pending} onClick={() => setAsking(a.id)} className="self-start mt-1 rounded-full border border-line px-3 py-2 text-xs font-semibold min-h-[44px]">No activity in {monthName}</button>}
          {asking === a.id && (
            <div className="flex flex-wrap gap-2 items-center mt-1">
              <span className="text-xs">Nothing was charged to this account in {monthName}?</span>
              <button disabled={pending} onClick={() => run(() => confirmNoActivity(a.id, health.period))} className="rounded-full bg-accent text-white px-3 py-2 text-xs font-semibold min-h-[44px] disabled:opacity-40">Yes, confirm</button>
              <button disabled={pending} onClick={() => setAsking(null)} className="rounded-full border border-line px-3 py-2 text-xs font-semibold min-h-[44px]">Cancel</button>
            </div>
          )}
        </div>
      ))}
      {confirmed.length > 0 && (
        <div className="flex flex-col gap-1">
          {confirmed.map((a) => (
            <div key={a.id} className="flex justify-between items-center gap-2 text-xs">
              <span><span className="font-semibold">{a.label}</span><span className="text-muted"> · no activity, confirmed</span></span>
              <button disabled={pending} onClick={() => run(() => undoNoActivity(a.id, health.period))} className="text-accent font-semibold min-h-[44px] px-2">Undo</button>
            </div>
          ))}
        </div>
      )}
      <details>
        <summary className="text-xs font-semibold text-muted cursor-pointer min-h-[32px]">All accounts</summary>
        <div className="flex flex-col gap-1 mt-1">
          {health.accounts.map((a) => (
            <div key={a.id} className="flex justify-between gap-2 text-xs">
              <span className="font-semibold">{a.label}</span>
              <span className={a.state === "gap" ? "text-amber" : a.state === "untracked" ? "text-muted" : "text-green"}>{a.state === "good" ? "good" : a.state === "confirmed" ? "confirmed" : a.state === "untracked" ? "statement only" : "needs attention"}</span>
            </div>
          ))}
        </div>
      </details>
      {error && <p role="alert" className="text-xs text-red m-0">{error}</p>}
    </div>
  );
}
