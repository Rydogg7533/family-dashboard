"use client";
import Link from "next/link";
import { useState } from "react";
import { setReceiptCard } from "@/app/money/actions";

export type FinishCardProps = {
  id: string; merchant: string; amountLabel: string; dateLabel: string; ageDays: number;
  card: string | null; paidWith?: string | null; unconfirmed: boolean; overdue: boolean;   // paidWith: "card → account" chain for display (D-2026-10-27)
  suggestion: { card: string; reason: string } | null; known: string[];
};

// One receipt on the Receipts to finish page. Big buttons; saving a card is the same action as everywhere else
// (record_card_vote, high confidence). The card then leaves "No card yet" and waits for its charge.
export function FinishCard(p: FinishCardProps) {
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function save(card: string) {
    setBusy(true); setErr(null);
    const x = await setReceiptCard(p.id, card);
    setBusy(false);
    if (x.ok) setSaved(card.trim()); else setErr("That did not save. Nothing changed; please try again.");
  }

  if (saved) return (
    <div className="card flex flex-col gap-1 border-green">
      <div className="flex justify-between gap-2"><span className="font-semibold">{p.merchant} · {p.amountLabel}</span><span className="text-xs text-muted">{p.dateLabel}</span></div>
      <div className="text-sm"><span className="text-green font-semibold">Saved.</span> Paid with {saved}. It now waits for the charge.</div>
    </div>
  );

  const tone = p.overdue ? "bg-amber-bg border-amber" : "";
  const hasCard = !!p.card;
  const shown = p.paidWith ?? p.card;
  const chips = Array.from(new Set([...p.known, "Cash"]));
  const btnPrimary = "min-h-13 rounded-xl bg-accent text-white font-semibold text-base disabled:opacity-50";
  const btnOutline = "min-h-13 rounded-xl border border-line font-semibold text-base";

  return (
    <div className={`card flex flex-col gap-2.5 ${tone}`}>
      <div className="flex justify-between items-baseline gap-2"><span className="font-semibold text-base">{p.merchant} · {p.amountLabel}</span><span className={`text-xs ${p.overdue ? "text-amber font-semibold" : "text-muted"}`}>{p.overdue ? `${p.ageDays} days` : p.dateLabel}</span></div>

      {hasCard ? (
        <div className={`text-sm ${p.overdue ? "text-amber" : "text-muted"}`}>
          {p.overdue ? "No charge found after 14 days. Check the card." : p.unconfirmed ? <>{shown} printed on the receipt. Not confirmed yet · {p.ageDays} {p.ageDays === 1 ? "day" : "days"}</> : <>Paid with {shown} · waiting for the charge · {p.ageDays} {p.ageDays === 1 ? "day" : "days"}</>}
        </div>
      ) : (
        <div className="text-sm text-muted">{p.suggestion ? `Likely ${p.suggestion.card}. ${p.suggestion.reason}.` : "Filing is waiting for a card."}</div>
      )}
      {err && <div className="text-xs text-red font-semibold">{err}</div>}

      {hasCard && p.unconfirmed && !p.overdue && <button disabled={busy} onClick={() => save(p.card as string)} className={btnOutline + " border-2 border-accent text-accent"}>Confirm {p.card}</button>}
      {hasCard && p.overdue && <Link href="/money/receipts?view=history" className={btnOutline + " flex items-center justify-center"}>Look for the charge</Link>}

      {!hasCard && !picking && (
        p.suggestion ? (
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => save((p.suggestion as { card: string }).card)} className={btnPrimary + " flex-1"}>Yes, {p.suggestion.card}</button>
            <button onClick={() => setPicking(true)} className={btnOutline + " px-4"}>Other</button>
          </div>
        ) : <button onClick={() => setPicking(true)} className={btnPrimary}>Pick the card</button>
      )}

      {!hasCard && picking && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">{chips.map((c) => <button key={c} disabled={busy} onClick={() => save(c)} className={btnOutline + " px-2 text-sm"}>{c}</button>)}</div>
          {!typing ? <button onClick={() => setTyping(true)} className="min-h-11 text-sm font-semibold text-accent">Another card or account</button> : (
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Name and last four, e.g. Amex 1004" className="min-h-12 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
              <button disabled={busy || !text.trim()} onClick={() => save(text)} className="min-h-12 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">Save</button>
            </div>
          )}
          <button onClick={() => { setPicking(false); setTyping(false); }} className="min-h-11 text-sm text-muted font-semibold">Cancel</button>
        </div>
      )}
    </div>
  );
}
