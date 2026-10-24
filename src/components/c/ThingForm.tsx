"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addThing, updateThing, setThingPrice, type ThingInput } from "@/app/things/actions";
import { uploadThingPhotos } from "@/lib/things-upload";
import { CATEGORY_SUGGESTIONS, SEASONS, isClothing } from "@/lib/things-shared";

type Initial = { id: string } & ThingInput;
const blank: ThingInput = { name: "", category: "", owner: "shared", location: "", brand: "", model: "", serialLast4: "", size: "", season: "", notes: "" };

// Add a thing, or edit one. Photos are shrunk on the phone (location data removed) and uploaded when you save, so nothing is left behind if you cancel.
export function ThingForm({ people, isOwner, initial, lastCategory, lastLocation }: { people: { key: string; label: string }[]; isOwner: boolean; initial?: Initial; lastCategory?: string; lastLocation?: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ThingInput>(initial ?? { ...blank, category: lastCategory ?? "", location: lastLocation ?? "" });
  const [price, setPrice] = useState({ dollars: "", date: "", store: "" });
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const set = (k: keyof ThingInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((c) => ({ ...c, [k]: e.target.value }));
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";

  if (!open) return <button onClick={() => setOpen(true)} className={initial ? "min-h-9 px-3 rounded-full border border-line text-xs font-semibold" : "min-h-10 px-4 rounded-full bg-accent text-white text-sm font-semibold"}>{initial ? "Edit details" : "Add a thing"}</button>;

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (initial) {
        const r = await updateThing(initial.id, f);
        if (!r.ok) throw new Error(r.error ?? "Could not save.");
      } else {
        const photos = files.length ? await uploadThingPhotos(files.map((x) => x.file)) : [];
        const r = await addThing(f, photos);
        if (!r.id) throw new Error(r.error ?? "Could not save.");
        if (isOwner && (price.dollars.trim() || price.store.trim() || price.date)) {
          const p = await setThingPrice(r.id, price.dollars, price.date, price.store);
          if (!p.ok) throw new Error(`Saved, but the price did not: ${p.error}`);
        }
        setF({ ...blank, category: f.category, location: f.location }); setPrice({ dollars: "", date: "", store: "" }); files.forEach((x) => URL.revokeObjectURL(x.url)); setFiles([]);
        if (!r.ok) { router.refresh(); throw new Error(r.error ?? "Saved with a problem."); }
      }
      setOpen(false); router.refresh();
    } catch (x) { setErr(x instanceof Error ? x.message : "Could not save."); }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="card flex flex-col gap-2 w-full">
      {!initial && (
        <>
          <div className="text-xs font-bold tracking-wide text-muted">PHOTOS</div>
          {files.length > 0 && (
            <div className="flex gap-2 flex-wrap">{files.map((x, i) => (
              <div key={x.url} className="relative w-16 h-16 rounded-xl overflow-hidden bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.url} alt="" className="w-full h-full object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => { URL.revokeObjectURL(x.url); setFiles((c) => c.filter((_, j) => j !== i)); }} className="absolute top-0 right-0 bg-black/60 text-white text-xs w-6 h-6">×</button>
              </div>))}
            </div>
          )}
          <button type="button" disabled={busy || files.length >= 12} onClick={() => pick.current?.click()} className="min-h-11 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">{files.length ? "Add another photo" : "Take or choose photos"}</button>
          <p className="text-[11px] text-muted">Photograph the thing, not people. Lay clothes flat. For anything valuable, add one photo of the label or serial number.</p>
          <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const add = Array.from(e.target.files ?? []).filter((x) => x.type.startsWith("image/")).map((file) => ({ file, url: URL.createObjectURL(file) })); setFiles((c) => [...c, ...add].slice(0, 12)); e.target.value = ""; }} />
        </>
      )}
      <input className={inp} placeholder="What is it? (e.g. Blue rain jacket, Cordless drill)" value={f.name} onChange={set("name")} required />
      <input className={inp} list="thing-cats" placeholder="Category (type your own or pick one)" value={f.category} onChange={set("category")} />
      <datalist id="thing-cats">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <label className="text-xs text-muted">Whose is it
        <select className={inp} value={f.owner} onChange={set("owner")}>
          <option value="shared">Shared (the household)</option>
          {people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <input className={inp} placeholder="Where does it live? (e.g. Garage, top shelf)" value={f.location} onChange={set("location")} />
      {isClothing(f.category) && (
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Size" value={f.size} onChange={set("size")} />
          <select className={inp} value={f.season} onChange={set("season")}><option value="">Season (optional)</option>{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input className={inp} placeholder="Brand" value={f.brand} onChange={set("brand")} />
        <input className={inp} placeholder="Model" value={f.model} onChange={set("model")} />
      </div>
      <input className={inp} maxLength={4} inputMode="text" placeholder="Last 4 of the serial number (optional)" value={f.serialLast4} onChange={set("serialLast4")} />
      <textarea className={inp} rows={2} placeholder="Notes" value={f.notes} onChange={set("notes")} />
      {isOwner && !initial && (
        <>
          <div className="text-xs font-bold tracking-wide text-muted">PRICE (OPTIONAL, ONLY PARENTS SEE IT)</div>
          <input className={inp} inputMode="decimal" placeholder="What it cost, e.g. 49.99" value={price.dollars} onChange={(e) => setPrice((c) => ({ ...c, dollars: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder="Store" value={price.store} onChange={(e) => setPrice((c) => ({ ...c, store: e.target.value }))} />
            <input type="date" className={inp} value={price.date} onChange={(e) => setPrice((c) => ({ ...c, date: e.target.value }))} />
          </div>
          <p className="text-[11px] text-muted">You can link a receipt after saving and the price fills in from it. A price you type is never overwritten.</p>
        </>
      )}
      {err && <div className="text-sm text-red font-semibold">{err}</div>}
      <div className="flex gap-2"><button type="submit" disabled={busy || !f.name.trim()} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Saving…" : initial ? "Save changes" : "Save"}</button><button type="button" onClick={() => { setOpen(false); setErr(null); }} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Cancel</button></div>
    </form>
  );
}
