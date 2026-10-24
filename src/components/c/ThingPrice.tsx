"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setThingPrice, listReceiptsForItem, attachReceipt, type PickReceipt } from "@/app/things/actions";
import { money, PRICE_SOURCE_LABEL, type ThingPrice as Price } from "@/lib/things-shared";

// Owners only. Shows the price with where it came from; a price typed here always wins over a receipt fill.
export function ThingPrice({ itemId, price, receipt }: { itemId: string; price: Price | null; receipt: { merchant: string; amount: number; date: string } | null }) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState(price?.cents != null ? (price.cents / 100).toFixed(2) : "");
  const [store, setStore] = useState(price?.store ?? "");
  const [date, setDate] = useState(price?.purchaseDate ?? "");
  const [est, setEst] = useState(price?.source === "estimated");
  const [picking, setPicking] = useState<PickReceipt[] | null>(null);
  const [choose, setChoose] = useState<PickReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
  const done = (note?: string) => { setBusy(false); setMsg(note ?? null); router.refresh(); };

  return (
    <div className="card flex flex-col gap-2">
      <div className="text-xs font-bold tracking-wide text-muted">PRICE · ONLY PARENTS SEE THIS</div>
      {!edit && (
        <>
          <div className="text-lg font-semibold">{price?.cents != null ? money(price.cents) : "No price yet"}</div>
          {price?.source && <div className="text-xs text-muted">{PRICE_SOURCE_LABEL[price.source]}{price.store ? ` · ${price.store}` : ""}{price.purchaseDate ? ` · ${price.purchaseDate}` : ""}</div>}
          {receipt && <div className="text-xs">Linked receipt: {receipt.merchant}, {money(Math.round(receipt.amount * 100))}, {receipt.date}</div>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setEdit(true)} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold">{price?.cents != null ? "Change price" : "Enter price"}</button>
            <button disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await listReceiptsForItem(itemId); setBusy(false); if (!r.ok) setErr("Could not load receipts."); else setPicking(r.receipts); }} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold">{receipt ? "Link a different receipt" : "Link a receipt"}</button>
          </div>
        </>
      )}
      {edit && (
        <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); const r = await setThingPrice(itemId, d, date, store, est); if (!r.ok) { setBusy(false); setErr(r.error ?? "Could not save."); return; } setEdit(false); done(); }} className="flex flex-col gap-2">
          <input className={inp} inputMode="decimal" placeholder="What it cost, e.g. 49.99 (blank clears it)" value={d} onChange={(e) => setD(e.target.value)} />
          <div className="grid grid-cols-2 gap-2"><input className={inp} placeholder="Store" value={store} onChange={(e) => setStore(e.target.value)} /><input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={est} onChange={(e) => setEst(e.target.checked)} /> This is a guess, not what was paid</label>
          <div className="flex gap-2"><button type="submit" disabled={busy} className="flex-1 min-h-10 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">Save price</button><button type="button" onClick={() => setEdit(false)} className="min-h-10 px-4 rounded-xl border border-line text-sm font-semibold">Cancel</button></div>
        </form>
      )}
      {picking && !choose && (
        <div className="flex flex-col gap-1">
          <div className="text-xs font-bold tracking-wide text-muted">PICK THE RECEIPT</div>
          {picking.length === 0 && <div className="text-xs text-muted">No receipts yet.</div>}
          {picking.slice(0, 12).map((r) => (
            <button key={r.id} onClick={() => setChoose(r)} className="text-left rounded-xl bg-soft px-3 py-2 text-sm flex justify-between gap-2"><span className="min-w-0 truncate">{r.merchant}</span><span className="shrink-0 text-xs text-muted">{money(Math.round(r.amount * 100))} · {r.date}</span></button>
          ))}
          <button onClick={() => setPicking(null)} className="text-xs font-semibold text-muted self-start min-h-9">Close</button>
        </div>
      )}
      {choose && (
        <div className="rounded-xl border border-accent p-3 flex flex-col gap-2 text-sm">
          <div>Is the {choose.merchant} receipt ({money(Math.round(choose.amount * 100))}) for just this one item?</div>
          <div className="flex gap-2 flex-wrap">
            <button disabled={busy} onClick={async () => { setBusy(true); const r = await attachReceipt(itemId, choose.id, true); setChoose(null); setPicking(null); if (!r.ok) { setBusy(false); setErr(r.error ?? "Could not link."); } else done(r.note); }} className="min-h-10 px-4 rounded-xl bg-accent text-white font-semibold text-sm">Yes, use its price</button>
            <button disabled={busy} onClick={async () => { setBusy(true); const r = await attachReceipt(itemId, choose.id, false); setChoose(null); setPicking(null); if (!r.ok) { setBusy(false); setErr(r.error ?? "Could not link."); } else done(r.note); }} className="min-h-10 px-4 rounded-xl border border-line font-semibold text-sm">No, it has other things</button>
            <button onClick={() => setChoose(null)} className="min-h-10 px-3 text-xs font-semibold text-muted">Back</button>
          </div>
          <div className="text-[11px] text-muted">A receipt total is only used as the price when you say it covers one item. A price you typed yourself is never replaced.</div>
        </div>
      )}
      {msg && <div className="text-xs text-green font-semibold">{msg}</div>}
      {err && <div className="text-sm text-red font-semibold">{err}</div>}
    </div>
  );
}
