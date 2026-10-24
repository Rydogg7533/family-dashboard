"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addWarranty, updateWarranty, type WarrantyInput } from "@/app/warranties/actions";
import { readWarrantyInfo, type WarrantySuggestion } from "@/app/warranties/read";
import { createClient as createBrowserSb } from "@/lib/supabase/client";

type Role = "receipt" | "warranty info";
type Att = { path: string; name: string; role: Role };
type Initial = { id: string; item: string; provider: string; for_who: string; start: string; end: string; terms: string; attachments: Att[] };
const blank = { item: "", provider: "", for_who: "", start: "", end: "", terms: "" };

// Add a warranty, or edit one you added. Files go to the private captures bucket; each is a receipt or warranty info (card, certificate, terms page).
export function AddWarranty({ initial }: { initial?: Initial }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial ? { item: initial.item, provider: initial.provider, for_who: initial.for_who, start: initial.start, end: initial.end, terms: initial.terms } : blank);
  const [files, setFiles] = useState<Att[]>(initial?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sug, setSug] = useState<WarrantySuggestion | null>(null);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const role = useRef<Role>("warranty info");
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((c) => ({ ...c, [k]: e.target.value }));
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";

  async function upload(list: FileList | null) {
    const chosen = Array.from(list ?? []).filter((x) => (x.type.startsWith("image/") || x.type === "application/pdf") && x.size <= 25 * 1024 * 1024);
    if (pick.current) pick.current.value = "";
    if (!chosen.length) { setErr("Choose a photo or PDF under 25 MB."); return; }
    setBusy(true); setErr(null);
    try {
      const sb = createBrowserSb();
      const { data: { user } } = await sb.auth.getUser();
      const added: Att[] = [];
      for (const file of chosen) {
        const key = `${user?.id}/warranties/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 100)}`;
        const { error } = await sb.storage.from("captures").upload(key, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw new Error(error.message);
        added.push({ path: key, name: file.name, role: role.current });
      }
      setFiles((c) => [...c, ...added].slice(0, 8));
      const info = added.filter((a) => a.role === "warranty info").map((a) => a.path);
      if (info.length) {
        setReading(true); setSug(null); setNote(null);
        const r = await readWarrantyInfo(info).catch(() => ({ ok: false as const, message: "Reading failed. You can fill the form in by hand.", suggestion: undefined }));
        setReading(false);
        if (r.ok && r.suggestion) setSug(r.suggestion); else setNote(r.message ?? null);
      }
    } catch (e) { setErr(`A file did not upload (${e instanceof Error ? e.message : "unknown error"}). Nothing was added; try again.`); }
    setBusy(false);
  }
  function choose(r: Role) { role.current = r; pick.current?.click(); }

  if (!open) return <button onClick={() => setOpen(true)} className={initial ? "min-h-9 px-3 rounded-full border border-line text-xs font-semibold" : "min-h-10 px-4 rounded-full bg-accent text-white text-sm font-semibold"}>{initial ? "Edit" : "Add warranty"}</button>;
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      const input: WarrantyInput = { ...f, attachments: files };
      const r = initial ? await updateWarranty(initial.id, input) : await addWarranty(input);
      setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
      if (!initial) { setF(blank); setFiles([]); }
      setOpen(false); router.refresh();
    }} className="card flex flex-col gap-2 w-full">
      <input className={inp} placeholder="What is covered (e.g. Dishwasher, roof, laptop)" value={f.item} onChange={set("item")} />
      <input className={inp} placeholder="Who provides it (store, brand, company)" value={f.provider} onChange={set("provider")} />
      <input className={inp} placeholder="Whose or where (a person's name, Household, Kitchen)" value={f.for_who} onChange={set("for_who")} />
      <label className="text-xs text-muted">Starts<input type="date" className={inp} value={f.start} onChange={set("start")} /></label>
      <label className="text-xs text-muted">Ends (leave blank if the paper doesn’t say)<input type="date" className={inp} value={f.end} onChange={set("end")} /></label>
      <textarea className={inp} rows={2} placeholder="Terms worth remembering (what is covered, what voids it)" value={f.terms} onChange={set("terms")} />
      <div className="text-xs font-bold tracking-wide text-muted">FILES</div>
      {files.map((x, i) => (
        <div key={x.path} className="flex items-center justify-between gap-2 text-sm rounded-xl bg-soft px-3 py-1.5">
          <span className="min-w-0 truncate"><span className="text-[10px] font-bold text-muted mr-1.5">{x.role === "receipt" ? "RECEIPT" : "WARRANTY INFO"}</span>{x.name}</span>
          <button type="button" aria-label="Remove file" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} className="text-muted font-bold px-1">×</button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy || files.length >= 8} onClick={() => choose("receipt")} className="min-h-10 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">Add receipt</button>
        <button type="button" disabled={busy || files.length >= 8} onClick={() => choose("warranty info")} className="min-h-10 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">Add warranty info</button>
      </div>
      {reading && <div className="text-xs text-accent font-semibold">Reading the warranty info…</div>}
      {note && <div className="text-xs text-muted">{note}</div>}
      {sug && (
        <div className="rounded-xl border border-accent p-2 text-xs flex flex-col gap-1">
          <div className="font-bold tracking-wide text-accent">SUGGESTED FROM THE FILE (check before you use it)</div>
          {sug.item && <div>Covers: {sug.item}</div>}
          {sug.provider && <div>Provider: {sug.provider}</div>}
          {sug.start && <div>Starts: {sug.start}</div>}
          {sug.end && <div>Ends: {sug.end}{sug.endNote ? ` (${sug.endNote})` : ""}</div>}
          {sug.terms && <div>Terms: {sug.terms}</div>}
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => { setF((c) => ({ item: c.item || sug.item || "", provider: c.provider || sug.provider || "", for_who: c.for_who, start: c.start || sug.start || "", end: c.end || sug.end || "", terms: c.terms || sug.terms || "" })); setSug(null); }} className="min-h-9 px-3 rounded-xl bg-accent text-white font-semibold">Use these</button>
            <button type="button" onClick={() => setSug(null)} className="min-h-9 px-3 rounded-xl border border-line font-semibold">Ignore</button>
          </div>
          <div className="text-muted">“Use these” fills only the empty boxes. Nothing is saved until you tap Save warranty.</div>
        </div>
      )}
      <p className="text-[11px] text-muted">Warranty info = the warranty card, certificate, terms page, or a photo of the label. Photos and PDFs, up to 8 files.</p>
      <input ref={pick} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
      {err && <div className="text-sm text-red font-semibold">{err}</div>}
      <div className="flex gap-2"><button type="submit" disabled={busy || !f.item.trim()} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Working…" : "Save warranty"}</button><button type="button" onClick={() => { setOpen(false); setErr(null); }} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Cancel</button></div>
    </form>
  );
}
