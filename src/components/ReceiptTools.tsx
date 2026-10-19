"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Transaction, Receipt } from "@/lib/data-money";
import { attachProof, explainCharge, answerReceiptQuestion } from "@/app/money/actions";

const money = (n: number) => "$" + n.toFixed(2);

// The per-charge resolve panel: Camera / Upload / Find in email / Explain. Any one resolves the item once recorded.
export function ChargeResolver({ tx, mode }: { tx: Transaction; mode: string | null }) {
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rule, setRule] = useState(true);
  const [searching, setSearching] = useState(mode === "email");
  const camRef = useRef<HTMLInputElement>(null);
  const upRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (mode === "camera") camRef.current?.click(); if (mode === "upload") upRef.current?.click(); }, [mode]);
  useEffect(() => { if (!searching) return; const t = setTimeout(() => setSearching(false), 1200); return () => clearTimeout(t); }, [searching]);

  async function file(kind: "photo" | "digital_receipt", f: File | undefined) {
    if (!f) return;
    await attachProof(tx.id, kind, f.name);
    setDone(`${kind === "photo" ? "Photo" : "File"} "${f.name}" attached to ${tx.merchant} ${money(tx.amount)}. Filed to Finance/2026/${tx.category ?? "[category]"}; a thumbnail and link stay here.`);
  }

  if (done) return <div className="card border-green text-sm"><span className="text-green font-semibold">Resolved.</span> {done} <Link href="/money" className="font-semibold text-accent">Back to Money</Link></div>;

  return (
    <div className="card border-accent flex flex-col gap-2">
      <div className="text-[11px] font-bold tracking-wide text-amber">RESOLVE THIS CHARGE</div>
      <div className="font-semibold">{tx.merchant} {money(tx.amount)}</div>
      <div className="text-[11px] text-muted">{tx.for_person === "Joint" ? "Joint card" : `${tx.for_person}'s card`} · {tx.captured_by}</div>
      <div className="text-xs text-muted">Searched: {tx.searched.length ? tx.searched.join(", ") : "nothing yet"} · no match by amount, merchant and date ±3 days.</div>
      {searching && <div className="text-xs text-accent font-semibold">Searching email (3 accounts), the financial inbox and Organized for {money(tx.amount)} near this date…</div>}
      {!searching && mode === "email" && <div className="text-xs text-amber font-semibold">Nothing found in email within ±3 days. Snap the paper receipt, upload a scan, or explain.</div>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => camRef.current?.click()} className="min-h-11 rounded-xl bg-accent text-white font-semibold text-sm">Camera</button>
        <button onClick={() => upRef.current?.click()} className="min-h-11 rounded-xl border border-line font-semibold text-sm">Upload</button>
        <button onClick={() => setSearching(true)} className="min-h-11 rounded-xl border border-line font-semibold text-sm">Find in email again</button>
        <button onClick={async () => { await attachProof(tx.id, "statement_line", null); setDone("Statement line kept as the minimum proof, marked \"statement only\". It stays amber until a receipt or photo arrives."); }} className="min-h-11 rounded-xl border border-line font-semibold text-sm">Statement only</button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => file("photo", e.target.files?.[0])} />
      <input ref={upRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => file("digital_receipt", e.target.files?.[0])} />
      <form onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await explainCharge(tx.id, note.trim(), rule); setDone(`Explained: "${note.trim()}".${rule ? " Rule proposed for the weekly review." : ""}`); }} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {["Cash tip, no receipt", "Personal, not business", "Split with [Name]", "Duplicate, dispute it"].map((s) => <button type="button" key={s} onClick={() => setNote(s)} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold">{s}</button>)}
        </div>
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain in a few words…" className="flex-1 min-h-11 rounded-xl border border-line bg-bg px-3 text-sm" />
          <button type="submit" disabled={!note.trim()} className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm disabled:opacity-40">Explain</button>
        </div>
        <label className="text-xs text-muted flex items-center gap-2"><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} /> Make this a rule for {tx.merchant} (proposed, one tap to approve)</label>
      </form>
      {/duplicate|dispute/i.test(note) && <div className="text-xs text-amber">Disputing happens outside the dashboard: a task with the card&apos;s dispute steps will be prepared; nothing is disputed from here.</div>}
    </div>
  );
}

export function ReceiptAsk({ r }: { r: Receipt }) {
  const [done, setDone] = useState(false);
  const opts = /business or personal/i.test(r.question ?? "") ? ["Personal", "Veil Labs", "SHVR", "Et Al", "Pixel Empire"] : /which account/i.test(r.question ?? "") ? ["Amex ••1004", "Chase ••5521", "Visa ••3310", "Cash"] : ["Yes", "No"];
  if (done) return <div className="card text-sm text-green font-semibold">Recorded. Matching again with the answer; a rule is proposed.</div>;
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex justify-between text-sm"><span className="font-semibold">{r.merchant}</span><span className="font-semibold">{money(r.amount)}</span></div>
      <div className="text-xs text-muted">{r.captured_by} · from {r.source} · {r.date} · <a href="#" className="font-semibold text-accent">Open in Files</a></div>
      <div className="text-sm font-semibold text-amber">{r.question}</div>
      <div className="flex flex-wrap gap-1.5">{opts.map((o) => <button key={o} onClick={async () => { await answerReceiptQuestion(r.id, o); setDone(true); }} className="min-h-10 px-3 rounded-full border border-line text-sm font-semibold">{o}</button>)}</div>
    </div>
  );
}

export function BulkDrop() {
  const ref = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); setNames(Array.from(e.dataTransfer.files).map((f) => f.name)); }} onClick={() => ref.current?.click()}
        className={`min-h-24 rounded-xl border-2 border-dashed flex items-center justify-center text-sm font-semibold cursor-pointer ${over ? "border-accent bg-soft" : "border-line"}`}>
        Drop receipts, statements, invoices here (or tap)
      </div>
      <input ref={ref} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))} />
      {names.length > 0 && <div className="text-xs text-green font-semibold">{names.length} received. Each is read (local OCR), identified, matched to a charge and filed; anything unclear becomes one question above.</div>}
    </div>
  );
}
