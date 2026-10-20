"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveVehicle, type VehicleInput } from "@/app/vehicles/actions";
import { VEHICLE_SECTIONS, EMPTY_SERVICE, EMPTY_WARRANTY, type ServiceEntry, type VField, type Warranty } from "@/lib/vehicle-fields";

type Person = { id: string; name: string };
const inp = "w-full min-h-11 rounded-xl border border-line bg-bg px-3 text-sm";

function Field({ f, value, onChange }: { f: VField; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold">{f.label}</span>
      {f.type === "select" ? (
        <select className={inp} value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
      ) : f.type === "textarea" ? (
        <textarea className={inp + " py-2 min-h-20"} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={inp} type={f.type === "date" ? "date" : f.type === "number" ? "number" : f.type === "tel" ? "tel" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {f.hint && <span className="text-[11px] text-muted">{f.hint}</span>}
    </label>
  );
}

export function VehicleForm({ id, initial, people }: { id: string | null; initial: VehicleInput; people: Person[] }) {
  const router = useRouter();
  const [v, setV] = useState<VehicleInput>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const top = (k: keyof VehicleInput) => (val: string) => setV((s) => ({ ...s, [k]: val }));
  const det = (k: string) => (val: string) => setV((s) => ({ ...s, details: { ...s.details, [k]: val } }));
  const setW = (i: number, k: keyof Warranty, val: string) => setV((s) => ({ ...s, warranties: s.warranties.map((w, j) => (j === i ? { ...w, [k]: val } : w)) }));
  const setS = (i: number, k: keyof ServiceEntry, val: string) => setV((s) => ({ ...s, service: s.service.map((w, j) => (j === i ? { ...w, [k]: val } : w)) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await saveVehicle(id, v);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
    router.push("/vehicles"); router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-24">
      <section className="card flex flex-col gap-3">
        <div className="font-bold">Basics</div>
        <div className="grid grid-cols-3 gap-2">
          <Field f={{ key: "year", label: "Year", type: "number" }} value={v.year} onChange={top("year")} />
          <div className="col-span-2"><Field f={{ key: "make", label: "Make *" }} value={v.make} onChange={top("make")} /></div>
        </div>
        <Field f={{ key: "model", label: "Model *" }} value={v.model} onChange={top("model")} />
        <Field f={{ key: "short", label: "Short name", hint: "How it appears in lists and questions, e.g. Tahoe." }} value={v.short} onChange={top("short")} />
        <label className="flex flex-col gap-1"><span className="text-xs font-semibold">Main driver</span>
          <select className={inp} value={v.driver} onChange={(e) => top("driver")(e.target.value)}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <Field f={{ key: "plate", label: "License plate" }} value={v.plate} onChange={top("plate")} />
        <Field f={{ key: "vinPointer", label: "VIN: 1Password item name", hint: "The item's name only. The VIN itself is never stored here." }} value={v.vinPointer} onChange={top("vinPointer")} />
        <div className="grid grid-cols-2 gap-2">
          <Field f={{ key: "mileage", label: "Mileage now", type: "number" }} value={v.mileage} onChange={top("mileage")} />
          <Field f={{ key: "mileageAt", label: "As of", type: "date" }} value={v.mileageAt} onChange={top("mileageAt")} />
        </div>
      </section>

      {VEHICLE_SECTIONS.map((s) => (
        <details key={s.id} className="card" open={s.id === "dates" || s.id === "insurance"}>
          <summary className="font-bold cursor-pointer min-h-9 flex items-center">{s.title}</summary>
          {s.blurb && <p className="text-xs text-muted mt-1">{s.blurb}</p>}
          <div className="flex flex-col gap-3 mt-3">{s.fields.map((f) => <Field key={f.key} f={f} value={v.details[f.key] ?? ""} onChange={det(f.key)} />)}</div>
        </details>
      ))}

      <details className="card" open={v.warranties.length > 0}>
        <summary className="font-bold cursor-pointer min-h-9 flex items-center">Warranties ({v.warranties.length})</summary>
        <p className="text-xs text-muted mt-1">Battery, tires, powertrain, an extended plan, a repair. Receipts you upload file against these. The end date becomes a reminder.</p>
        <div className="flex flex-col gap-4 mt-3">
          {v.warranties.map((w, i) => (
            <div key={i} className="rounded-xl border border-line p-3 flex flex-col gap-2">
              <Field f={{ key: "w", label: "What is covered", placeholder: "Battery, powertrain, tires…" }} value={w.item} onChange={(x) => setW(i, "item", x)} />
              <Field f={{ key: "w", label: "Provider" }} value={w.provider} onChange={(x) => setW(i, "provider", x)} />
              <div className="grid grid-cols-2 gap-2">
                <Field f={{ key: "w", label: "Starts", type: "date" }} value={w.start} onChange={(x) => setW(i, "start", x)} />
                <Field f={{ key: "w", label: "Ends", type: "date" }} value={w.end} onChange={(x) => setW(i, "end", x)} />
              </div>
              <Field f={{ key: "w", label: "Mileage limit", type: "number" }} value={w.miles} onChange={(x) => setW(i, "miles", x)} />
              <Field f={{ key: "w", label: "Terms", type: "textarea", placeholder: "Free replacement 36 months, prorated after…" }} value={w.terms} onChange={(x) => setW(i, "terms", x)} />
              <Field f={{ key: "w", label: "Proof (receipt or document name)" }} value={w.proof} onChange={(x) => setW(i, "proof", x)} />
              <button type="button" className="self-start text-xs font-semibold text-red" onClick={() => setV((s) => ({ ...s, warranties: s.warranties.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          ))}
          <button type="button" className="min-h-11 rounded-xl border border-line font-semibold text-sm" onClick={() => setV((s) => ({ ...s, warranties: [...s.warranties, { ...EMPTY_WARRANTY }] }))}>Add a warranty</button>
        </div>
      </details>

      <details className="card" open={v.service.length > 0}>
        <summary className="font-bold cursor-pointer min-h-9 flex items-center">Service history ({v.service.length})</summary>
        <p className="text-xs text-muted mt-1">Past repairs and maintenance. Newest first is easiest to read; order does not matter.</p>
        <div className="flex flex-col gap-4 mt-3">
          {v.service.map((r, i) => (
            <div key={i} className="rounded-xl border border-line p-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Field f={{ key: "s", label: "Date", type: "date" }} value={r.date} onChange={(x) => setS(i, "date", x)} />
                <Field f={{ key: "s", label: "Mileage", type: "number" }} value={r.miles} onChange={(x) => setS(i, "miles", x)} />
              </div>
              <Field f={{ key: "s", label: "What was done", placeholder: "Battery replaced" }} value={r.what} onChange={(x) => setS(i, "what", x)} />
              <div className="grid grid-cols-2 gap-2">
                <Field f={{ key: "s", label: "Shop" }} value={r.shop} onChange={(x) => setS(i, "shop", x)} />
                <Field f={{ key: "s", label: "Cost ($)", type: "number" }} value={r.cost} onChange={(x) => setS(i, "cost", x)} />
              </div>
              <Field f={{ key: "s", label: "Receipt (document name)" }} value={r.proof} onChange={(x) => setS(i, "proof", x)} />
              <button type="button" className="self-start text-xs font-semibold text-red" onClick={() => setV((s) => ({ ...s, service: s.service.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          ))}
          <button type="button" className="min-h-11 rounded-xl border border-line font-semibold text-sm" onClick={() => setV((s) => ({ ...s, service: [...s.service, { ...EMPTY_SERVICE }] }))}>Add a service entry</button>
        </div>
      </details>

      {err && <div className="rounded-xl bg-red-bg text-red px-4 py-3 text-sm font-semibold">{err}</div>}
      <div className="fixed bottom-16 inset-x-0 z-30 bg-bg/95 backdrop-blur border-t border-line"><div className="max-w-md mx-auto px-5 py-3 flex gap-2">
        <Link href="/vehicles" className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm inline-flex items-center">Cancel</Link>
        <button disabled={busy} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Saving…" : id ? "Save changes" : "Add vehicle"}</button>
      </div></div>
    </form>
  );
}
