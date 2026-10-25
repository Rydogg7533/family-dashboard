"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { planWithVehicle } from "@/app/inbox/read";

// A card that is missing its vehicle: a dashed "Needed to continue" box, then "Save and plan".
// Picking changes nothing but this screen; "Save and plan" stores the pick and builds the plan; the later "Yes, file it" tap is what files.
export function NeededToContinue({ id, vehicles, onNotVehicle, notVehicleLabel }: { id: string; vehicles: string[]; onNotVehicle: () => void; notVehicleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!pick) return;
    setBusy(true); setError(null);
    const r = await planWithVehicle(id, pick).catch(() => ({ ok: false, error: "Could not save. Try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not save."); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-bold tracking-wide text-amber">NEEDED TO CONTINUE</div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="min-h-[52px] flex items-center gap-3 px-3.5 rounded-xl border-2 border-dashed border-amber bg-soft text-left">
        <span className="w-16 text-[13px] font-semibold text-amber">Vehicle</span>
        <span className="flex-1 text-[15px] font-semibold">{pick ?? "Add vehicle"}</span>
        <span aria-hidden className="text-amber">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5">
          {vehicles.map((v) => (
            <button key={v} type="button" onClick={() => { setPick(v); setOpen(false); }} className={`min-h-11 px-3 rounded-xl border text-left text-sm font-semibold ${pick === v ? "border-accent bg-soft" : "border-line"}`}>{v}</button>
          ))}
        </div>
      )}
      <div className="rounded-xl bg-soft px-3 py-2 text-xs">
        <div className="font-bold tracking-wide text-muted mb-1">ONCE FILLED IN</div>
        <div>Added to that vehicle's service history</div>
        <div>You then tap Yes to file it; nothing is filed before that</div>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!pick || busy} onClick={save} className="flex-1 min-h-12 rounded-xl bg-accent text-white text-[15px] font-semibold disabled:bg-line disabled:text-muted disabled:cursor-not-allowed">{busy ? "Planning…" : "Save and plan"}</button>
      </div>
      {!pick && <div className="text-[13px] text-amber">Add the vehicle to continue.</div>}
      {error && <div className="text-[13px] font-semibold text-amber">{error}</div>}
      <button type="button" onClick={onNotVehicle} className="self-start min-h-11 text-[13px] font-semibold text-accent">{notVehicleLabel}</button>
    </div>
  );
}
