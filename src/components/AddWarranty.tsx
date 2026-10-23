"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addWarranty } from "@/app/warranties/actions";

export function AddWarranty() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ item: "", provider: "", for_who: "", start: "", end: "", terms: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((c) => ({ ...c, [k]: e.target.value }));
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
  if (!open) return <button onClick={() => setOpen(true)} className="min-h-10 px-4 rounded-full bg-accent text-white text-sm font-semibold">Add warranty</button>;
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); const r = await addWarranty(f); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } setF({ item: "", provider: "", for_who: "", start: "", end: "", terms: "" }); setOpen(false); router.refresh(); }} className="card flex flex-col gap-2">
      <input className={inp} placeholder="What is covered (e.g. Dishwasher, roof, laptop)" value={f.item} onChange={set("item")} />
      <input className={inp} placeholder="Who provides it (store, brand, company)" value={f.provider} onChange={set("provider")} />
      <input className={inp} placeholder="Whose or where (Ryan, Melissa, Household, Kitchen)" value={f.for_who} onChange={set("for_who")} />
      <label className="text-xs text-muted">Starts<input type="date" className={inp} value={f.start} onChange={set("start")} /></label>
      <label className="text-xs text-muted">Ends (leave blank if the paper doesn’t say)<input type="date" className={inp} value={f.end} onChange={set("end")} /></label>
      <textarea className={inp} rows={2} placeholder="Terms worth remembering (what is covered, what voids it)" value={f.terms} onChange={set("terms")} />
      {err && <div className="text-sm text-red font-semibold">{err}</div>}
      <div className="flex gap-2"><button type="submit" disabled={busy || !f.item.trim()} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save warranty"}</button><button type="button" onClick={() => setOpen(false)} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Cancel</button></div>
    </form>
  );
}
