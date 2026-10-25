"use client";
import { useState, useTransition } from "react";
import { Toast, useToast } from "@/components/Toast";
import { saveAmazonInvoiceSetting } from "@/app/settings/money/actions";
import type { AmazonInvoiceSetting as Setting, BelowMode } from "@/lib/amazon-invoice-setting";

export function AmazonInvoiceSetting({ initial, canEdit, changedBy }: { initial: Setting; canEdit: boolean; changedBy: string | null }) {
  const [amount, setAmount] = useState(String(initial.ask_min_amount));
  const [below, setBelow] = useState<BelowMode>(initial.below);
  const [saved, setSaved] = useState<Setting>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast, show, clear } = useToast();
  const dirty = Number(amount.replace(/[$,\s]/g, "")) !== saved.ask_min_amount || below !== saved.below;

  const save = () => start(async () => {
    setError(null);
    const r = await saveAmazonInvoiceSetting({ ask_min_amount: amount, below });
    if (!r.ok) { setError(r.error ?? "Could not save."); return; }
    const now: Setting = { ask_min_amount: Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100) / 100, below };
    setSaved(now); setAmount(String(now.ask_min_amount));
    const prev = r.previous;
    show("Saved", prev ? () => start(async () => { const u = await saveAmazonInvoiceSetting(prev); if (u.ok) { setSaved(prev); setAmount(String(prev.ask_min_amount)); setBelow(prev.below); } else setError(u.error ?? "Could not undo."); }) : undefined);
  });

  return (
    <div className="card">
      <div className="font-semibold">Amazon invoices</div>
      <p className="text-xs text-muted mt-1">The order total and date come from the order email. Item names and prices need the invoice PDF or Amazon’s order-history file.</p>
      <label className="block mt-3 text-sm font-semibold" htmlFor="ask-min">Ask me for the invoice when the order is at least</label>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-lg font-semibold" aria-hidden>$</span>
        <input id="ask-min" inputMode="decimal" value={amount} disabled={!canEdit || pending} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded-lg border border-line bg-bg px-3 py-2 text-base" />
      </div>
      <p className="text-xs text-muted mt-1">$0 means every order.</p>
      <fieldset className="mt-3" disabled={!canEdit || pending}>
        <legend className="text-sm font-semibold">Orders below that amount</legend>
        <label className="flex items-start gap-2 mt-1 text-sm"><input type="radio" name="below" checked={below === "wait_for_history"} onChange={() => setBelow("wait_for_history")} className="mt-1" /><span>Wait for the Amazon order-history file <span className="text-muted">(one task lists them)</span></span></label>
        <label className="flex items-start gap-2 mt-1 text-sm"><input type="radio" name="below" checked={below === "ignore"} onChange={() => setBelow("ignore")} className="mt-1" /><span>Leave them as order number, date and total</span></label>
      </fieldset>
      {error && <p role="alert" className="text-xs text-red mt-2">{error}</p>}
      {canEdit ? <button onClick={save} disabled={!dirty || pending} className="mt-3 rounded-full bg-accent text-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{pending ? "Saving…" : "Save"}</button> : <p className="text-xs text-muted mt-3">Only an owner can change this.</p>}
      {changedBy && <p className="text-[11px] text-muted mt-2">Last changed by {changedBy}.</p>}
      <Toast toast={toast} onDone={clear} />
    </div>
  );
}
