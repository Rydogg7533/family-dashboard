"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThingForm } from "@/components/c/ThingForm";
import { addCatalogAreas, setAreaDone, reopenArea, archiveArea, finishCatalog, reopenCatalog } from "@/app/things/catalog-actions";
import { SUGGESTED_AREAS, evaluate, type CatalogView } from "@/lib/catalog-shared";

export function CatalogGuide({ view, people, isOwner }: { view: CatalogView; people: { key: string; label: string }[]; isOwner: boolean }) {
  const router = useRouter();
  const [pick, setPick] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);        // area id awaiting "nothing here" confirmation
  const [gaps, setGaps] = useState<{ name: string; missing: number }[] | null>(null);
  const e = evaluate(view);
  const done = view.areas.length - e.open.length;
  const run = async (f: () => Promise<{ ok: boolean; error?: string; note?: string; gaps?: { name: string; missing: number }[] }>) => {
    setBusy(true); setErr(null); setMsg(null);
    const r = await f(); setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not save."); if (r.gaps) setGaps(r.gaps); return false; }
    if (r.note) setMsg(r.note); setGaps(null); setAsk(null); router.refresh(); return true;
  };
  const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
  const prim = "min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50";
  const unused = SUGGESTED_AREAS.filter((s) => !view.areas.some((a) => a.name.toLowerCase() === s.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      {view.completedAt && (
        <div className="card border-green">
          <div className="font-semibold text-green">{view.outcome === "complete_with_gaps" ? "Finished, with some photos still missing" : "Finished"}</div>
          <div className="text-xs text-muted mt-1">{view.totalItems} items across {view.areas.length} areas. From now on, add things as you buy them, and link receipts to fill in prices. New areas or a reopened area bring this task back.</div>
          <button disabled={busy} onClick={() => run(reopenCatalog)} className={`${btn} mt-2`}>Reopen the task</button>
        </div>
      )}
      {view.areas.length > 0 && (
        <div className="card">
          <div className="flex justify-between text-sm font-semibold"><span>{done} of {view.areas.length} areas done</span><span className="text-muted">{view.totalItems} items</span></div>
          <div className="h-2 rounded-full bg-soft mt-2 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${view.areas.length ? Math.round((done / view.areas.length) * 100) : 0}%` }} /></div>
        </div>
      )}
      {view.areas.map((a) => (
        <div key={a.id} className="card flex flex-col gap-2">
          <div className="flex justify-between items-start gap-2">
            <div className="font-semibold">{a.name}</div>
            <div className={`text-xs font-bold ${a.done ? "text-green" : "text-muted"}`}>{a.done ? (a.nothingHere ? "Done (nothing here)" : "Done") : "To do"}</div>
          </div>
          <div className="text-xs text-muted">{a.items} {a.items === 1 ? "item" : "items"}{a.items ? ` · ${a.withPhoto} with a photo${a.items > a.withPhoto ? `, ${a.items - a.withPhoto} without` : ""}` : ""}</div>
          {!a.done && <ThingForm people={people} isOwner={isOwner} areaId={a.id} areaName={a.name} label={`Add items in the ${a.name}`} />}
          {!a.done && (
            ask === a.id
              ? <div className="rounded-xl border border-accent p-3 text-sm flex flex-col gap-2"><div>Nothing to catalog in the {a.name}? It will count as done.</div><div className="flex gap-2"><button disabled={busy} onClick={() => run(() => setAreaDone(a.id, true))} className={prim}>Yes, nothing here</button><button onClick={() => setAsk(null)} className={btn}>Back</button></div></div>
              : <div className="flex gap-2 flex-wrap"><button disabled={busy} onClick={async () => { if (a.items === 0) setAsk(a.id); else await run(() => setAreaDone(a.id, false)); }} className={btn}>This area is done</button><button disabled={busy} onClick={() => run(() => archiveArea(a.id))} className="min-h-10 px-3 text-xs font-semibold text-muted">Remove area</button></div>
          )}
          {a.done && <div className="flex gap-2 flex-wrap"><button disabled={busy} onClick={() => run(() => reopenArea(a.id))} className={btn}>Reopen</button></div>}
        </div>
      ))}
      <div className="card flex flex-col gap-2">
        <div className="text-xs font-bold tracking-wide text-muted">{view.areas.length ? "ADD AREAS" : "STEP 1 · PICK THE AREAS TO CATALOG"}</div>
        {!view.areas.length && <p className="text-xs text-muted">Choose the places things live. You can add more any time. Each area gets its own checklist, and you mark it done when you are happy with it.</p>}
        <div className="flex flex-wrap gap-2">{unused.map((s) => { const on = pick.includes(s); return <button key={s} type="button" onClick={() => setPick((c) => (on ? c.filter((x) => x !== s) : [...c, s]))} className={`rounded-full px-3 min-h-9 text-xs font-semibold border ${on ? "bg-accent text-white border-accent" : "border-line"}`}>{s}</button>; })}</div>
        <div className="flex gap-2"><input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Another place (e.g. Attic, Boat)" className="flex-1 min-h-10 rounded-xl border border-line bg-bg px-3 text-sm" /></div>
        <button disabled={busy || (!pick.length && !custom.trim())} onClick={async () => { if (await run(() => addCatalogAreas([...pick, custom]))) { setPick([]); setCustom(""); } }} className={prim}>{view.areas.length ? "Add these areas" : "Start cataloging"}</button>
      </div>
      {view.areas.length > 0 && !view.completedAt && (
        <div className="card flex flex-col gap-2">
          <div className="text-xs font-bold tracking-wide text-muted">FINISH</div>
          <p className="text-xs text-muted">When every area is marked done, run the check. It looks for items with no photo. You can fix them, or finish anyway and the catalog will say it was finished with gaps.</p>
          {e.open.length > 0 && <p className="text-xs">Still to do: {e.open.map((a) => a.name).join(", ")}.</p>}
          {gaps && (
            <div className="rounded-xl border border-accent p-3 text-sm flex flex-col gap-2">
              <div className="font-semibold">Items without a photo</div>
              {gaps.map((g) => <div key={g.name} className="text-xs">{g.name}: {g.missing}</div>)}
              <div className="flex gap-2 flex-wrap"><button disabled={busy} onClick={() => run(() => finishCatalog(true))} className={prim}>Finish anyway</button><button onClick={() => setGaps(null)} className={btn}>I will add photos</button></div>
            </div>
          )}
          {!gaps && <button disabled={busy || !e.ready} onClick={() => run(() => finishCatalog(false))} className={prim}>{busy ? "Checking…" : "Check and finish"}</button>}
        </div>
      )}
      {view.unassigned > 0 && <p className="text-xs text-muted">{view.unassigned} items were added outside a guided area. They are still in Things.</p>}
      {msg && <div className="text-sm text-green font-semibold">{msg}</div>}
      {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
    </div>
  );
}
