"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSheetItem, updateSheetItem, archiveSheetItem, setSectionState, finishSitterSheet, listThingsForPicker } from "@/app/settings/sitter/actions";
import { SECTIONS, type TemplateItem } from "@/lib/sitter-shared";

type St = Record<string, "todo" | "done" | "skipped">;
export function SitterSheetEditor({ items, states, completed }: { items: TemplateItem[]; states: St; completed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { text: string; on: boolean; thing?: { id: string; name: string } | null }>>({});
  const [edit, setEdit] = useState<Record<string, { text: string; on: boolean }>>({});
  const [pick, setPick] = useState<{ sec: string; q: string; list: { id: string; name: string }[] } | null>(null);
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
  const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
  const prim = "min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50";
  const run = async (f: () => Promise<{ ok: boolean; error?: string; note?: string }>, after?: () => void) => { setBusy(true); setErr(null); setMsg(null); const r = await f(); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return false; } if (r.note) setMsg(r.note); after?.(); router.refresh(); return true; };
  const done = SECTIONS.filter((s) => states[s.id] === "done" || states[s.id] === "skipped").length;

  return (
    <div className="flex flex-col gap-3">
      {completed
        ? <div className="card border-green"><div className="font-semibold text-green">Your sitter sheet is set up</div><div className="text-xs text-muted mt-1">Edit anything below any time. Each sitter night starts from this sheet and lets you change it for that visit.</div></div>
        : <div className="card"><div className="flex justify-between text-sm font-semibold"><span>{done} of {SECTIONS.length} sections done</span></div><div className="h-2 rounded-full bg-soft mt-2 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${Math.round((done / SECTIONS.length) * 100)}%` }} /></div></div>}
      {SECTIONS.map((s) => {
        const list = items.filter((i) => i.section === s.id); const st = states[s.id] ?? "todo"; const d = draft[s.id] ?? { text: "", on: true, thing: null };
        return (
          <div key={s.id} className="card flex flex-col gap-2">
            <div className="flex justify-between items-start gap-2"><div className="font-semibold">{s.title}</div><div className={`text-xs font-bold ${st === "todo" ? "text-muted" : "text-green"}`}>{st === "done" ? "Done" : st === "skipped" ? "Skipped" : "To do"}</div></div>
            <div className="text-xs text-muted">{s.hint}</div>
            {list.map((i) => {
              const e = edit[i.id];
              return (
                <div key={i.id} className="rounded-xl bg-soft p-2 flex flex-col gap-1.5">
                  <div className="flex gap-2 items-start">
                    {i.photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/thing-photo/${i.photo}?t=1`} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                    {e ? <textarea rows={2} className={inp} value={e.text} onChange={(ev) => setEdit((c) => ({ ...c, [i.id]: { ...e, text: ev.target.value } }))} /> : <div className="text-sm flex-1 whitespace-pre-wrap">{i.text}{i.thingName ? <span className="text-xs text-muted"> · {i.thingName}</span> : null}</div>}
                  </div>
                  {e ? (
                    <div className="flex gap-2 items-center flex-wrap">
                      {s.id !== "health" && <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={e.on} onChange={(ev) => setEdit((c) => ({ ...c, [i.id]: { ...e, on: ev.target.checked } }))} /> Show by default</label>}
                      <button disabled={busy} onClick={() => run(() => updateSheetItem(i.id, e.text, e.on), () => setEdit((c) => { const n = { ...c }; delete n[i.id]; return n; }))} className={btn}>Save</button>
                      <button onClick={() => setEdit((c) => { const n = { ...c }; delete n[i.id]; return n; })} className="text-xs font-semibold text-muted min-h-9 px-2">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center text-xs">
                      {s.id !== "health" && <span className="text-muted">{i.defaultOn ? "Shown by default" : "Off by default"}</span>}
                      <button onClick={() => setEdit((c) => ({ ...c, [i.id]: { text: i.text, on: i.defaultOn } }))} className="font-semibold text-accent min-h-9 px-1">Edit</button>
                      <button disabled={busy} onClick={() => run(() => archiveSheetItem(i.id))} className="font-semibold text-muted min-h-9 px-1">Hide</button>
                    </div>
                  )}
                </div>
              );
            })}
            <textarea rows={2} className={inp} placeholder={s.id === "contacts" ? "e.g. Ryan 801-555-0100 · Melissa 801-555-0101" : "Add an item"} value={d.text} onChange={(e) => setDraft((c) => ({ ...c, [s.id]: { ...d, text: e.target.value } }))} />
            {s.id === "where" && (
              <div className="flex flex-col gap-1.5">
                {d.thing ? <div className="text-xs">Photo from Things: <b>{d.thing.name}</b> <button onClick={() => setDraft((c) => ({ ...c, [s.id]: { ...d, thing: null } }))} className="text-muted font-bold px-1">×</button></div>
                  : <button type="button" onClick={async () => setPick({ sec: s.id, q: "", list: await listThingsForPicker("") })} className="text-xs font-semibold text-accent self-start min-h-9">Link a photo from Things</button>}
                {pick?.sec === s.id && (
                  <div className="rounded-xl border border-line p-2 flex flex-col gap-1">
                    <input className={inp} placeholder="Search your things" value={pick.q} onChange={async (e) => { const q = e.target.value; setPick({ sec: s.id, q, list: pick.list }); setPick({ sec: s.id, q, list: await listThingsForPicker(q) }); }} />
                    {pick.list.length === 0 && <div className="text-xs text-muted">Nothing found. Add it in Things first.</div>}
                    {pick.list.map((t) => <button key={t.id} onClick={() => { setDraft((c) => ({ ...c, [s.id]: { ...d, thing: t } })); setPick(null); }} className="text-left rounded-lg bg-soft px-3 py-2 text-sm">{t.name}</button>)}
                    <button onClick={() => setPick(null)} className="text-xs font-semibold text-muted self-start min-h-9">Close</button>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              {s.id !== "health" && <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={d.on} onChange={(e) => setDraft((c) => ({ ...c, [s.id]: { ...d, on: e.target.checked } }))} /> Show by default</label>}
              <button disabled={busy || !d.text.trim()} onClick={() => run(() => addSheetItem(s.id, d.text, d.thing?.id ?? null, d.on), () => setDraft((c) => ({ ...c, [s.id]: { text: "", on: true, thing: null } })))} className={btn}>Add</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {st !== "done" && <button disabled={busy} onClick={() => run(() => setSectionState(s.id, "done"))} className={btn}>This section is done</button>}
              {st !== "skipped" && s.canSkip && <button disabled={busy} onClick={() => run(() => setSectionState(s.id, "skipped"))} className="min-h-10 px-3 text-xs font-semibold text-muted">Skip for now</button>}
              {st !== "todo" && <button disabled={busy} onClick={() => run(() => setSectionState(s.id, "todo"))} className="min-h-10 px-3 text-xs font-semibold text-muted">Reopen</button>}
            </div>
          </div>
        );
      })}
      {!completed && (
        <div className="card flex flex-col gap-2">
          <div className="text-xs font-bold tracking-wide text-muted">FINISH</div>
          <p className="text-xs text-muted">When every section is done or skipped, run the check. Emergency contacts cannot be skipped.</p>
          <button disabled={busy} onClick={() => run(finishSitterSheet)} className={prim}>{busy ? "Checking…" : "Check and finish"}</button>
        </div>
      )}
      {msg && <div className="text-sm text-green font-semibold">{msg}</div>}
      {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
    </div>
  );
}
