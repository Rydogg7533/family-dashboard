"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerSubscription } from "@/app/money/subscriptions/actions";
import type { Candidate, Cycle } from "@/lib/data-subscriptions";

// "Is this a subscription?" Amount and cycle are pre-filled from the receipts when they were visible; check them, then tap once.
export function SubscriptionCandidate({ c }: { c: Candidate }) {
  const [amount, setAmount] = useState(c.amount_hint ? String(c.amount_hint) : "");
  const [cycle, setCycle] = useState<Cycle>(c.cycle_hint ?? "monthly");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (answer: "yes" | "no") => start(async () => {
    const r = await answerSubscription(c.id, answer, answer === "yes" ? parseFloat(amount.replace(/[$,]/g, "")) : undefined, cycle);
    if (r.ok) { setMsg(answer === "yes" ? "Added to the register." : "Noted. It will not be asked about again."); router.refresh(); } else setMsg(("error" in r && r.error) || "Could not save.");
  });
  const field = "min-h-11 px-3 rounded-xl border border-line bg-transparent text-sm";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <label className="flex items-center gap-1 text-sm"><span className="text-muted">$</span>
          <input inputMode="decimal" aria-label="Amount charged" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-24`} /></label>
        <select aria-label="How often" value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)} className={field}>
          <option value="monthly">monthly</option><option value="yearly">yearly</option><option value="weekly">weekly</option>
        </select>
      </div>
      {!c.amount_hint && <div className="text-[11px] text-muted">The receipts did not show an amount in the preview. Check the latest one and enter it.</div>}
      <div className="flex gap-2">
        <button className="min-h-11 px-3 rounded-xl border border-accent bg-accent text-white font-semibold text-sm flex-1 disabled:opacity-50" disabled={pending} onClick={() => send("yes")}>It&apos;s a subscription</button>
        <button className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm flex-1 disabled:opacity-50" disabled={pending} onClick={() => send("no")}>Not one</button>
      </div>
      {msg && <div className="text-xs font-semibold text-accent" role="status">{msg}</div>}
    </div>
  );
}
