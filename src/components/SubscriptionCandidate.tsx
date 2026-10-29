"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { answerSubscription } from "@/app/money/subscriptions/actions";
import type { Candidate, Cycle, Evidence } from "@/lib/data-subscriptions";

const shortDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
// "about every 30 days" from the sighting dates; nothing when there are fewer than two.
function cadence(ev: Evidence[]): string | null {
  const days = [...new Set(ev.map((e) => e.on))].sort().map((d) => Date.parse(d + "T12:00:00"));
  if (days.length < 2) return null;
  const gaps = days.slice(1).map((t, i) => Math.round((t - days[i]) / 86400000)).sort((a, b) => a - b);
  const med = gaps[Math.floor((gaps.length - 1) / 2)];
  return med >= 25 && med <= 35 ? "about monthly" : med >= 350 && med <= 380 ? "about yearly" : med >= 6 && med <= 8 ? "about weekly" : `about every ${med} days`;
}
const sourceWords = (e: Evidence) => e.source === "charge" ? "charge on a statement" : e.source === "notice" ? `notice email${e.mailbox ? ` in ${e.mailbox}` : ""}` : e.source === "store_receipt" ? "store receipt" : e.source === "manual" ? "entered by hand" : `receipt email${e.mailbox ? ` in ${e.mailbox}` : ""}`;

// "Is this a subscription?" Amount and cycle are pre-filled from the receipts when they were visible; check them, then tap once.
// The card says what it is asking from -- which charges and which emails, with the mailbox -- and has three answers: it is one,
// it is not one, or it was one and has ended (issue 984d6052, Ryan's rule of 2026-10-27).
export function SubscriptionCandidate({ c }: { c: Candidate }) {
  const [amount, setAmount] = useState(c.amount_hint ? String(c.amount_hint) : "");
  const [cycle, setCycle] = useState<Cycle>(c.cycle_hint ?? "monthly");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  const ev = c.evidence ?? [];
  const when = cadence(ev);
  const send = (answer: "yes" | "no" | "ended") => start(async () => {
    const r = await answerSubscription(c.id, answer, answer !== "no" ? parseFloat(amount.replace(/[$,]/g, "")) : undefined, cycle);
    if (r.ok) { setMsg(answer === "yes" ? "Added to the register." : answer === "ended" ? `Recorded as ended.${r.proposedRule ? ` A rule to stop triaging mail from ${r.proposedRule} is waiting on Review.` : ""}` : "Noted. It will not be asked about again."); if (path.startsWith("/tasks/")) router.replace("/tasks"); else router.refresh(); } // answering closes the task, so its own page no longer exists else setMsg(("error" in r && r.error) || "Could not save.");
  });
  const field = "min-h-11 px-3 rounded-xl border border-line bg-transparent text-sm";
  return (
    <div className="flex flex-col gap-2">
      {ev.length > 0 && (
        <div className="text-[11px] text-muted leading-relaxed">
          <span className="font-semibold text-fg">Asking because</span>{when ? ` (${when})` : ""}:{" "}
          {ev.slice(0, 4).map((e, i) => <span key={`${e.on}-${i}`}>{i ? " · " : ""}{shortDay(e.on)}{e.amount != null ? ` $${e.amount.toFixed(2)}` : ""}, {sourceWords(e)}</span>)}
          {ev.length > 4 ? ` · and ${ev.length - 4} more` : ""}
        </div>
      )}
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
        <button className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm flex-1 disabled:opacity-50" disabled={pending} onClick={() => send("ended")}>Ended</button>
      </div>
      {msg && <div className="text-xs font-semibold text-accent" role="status">{msg}</div>}
    </div>
  );
}
