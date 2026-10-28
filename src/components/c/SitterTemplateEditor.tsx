"use client";
// One template: lines by section, each on or off by default; health lines are always off until a visit ticks them.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addTemplateLine, archiveTemplateLine, updateTemplateLine } from "@/app/settings/sitter/templates-actions";
import { listThingsForPicker } from "@/app/settings/sitter/actions";
import { templateSections, type SitterTemplate, type TemplateLine } from "@/lib/sitter-shared";

const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";

export function SitterTemplateEditor({ template, lines, childAge }: { template: SitterTemplate; lines: TemplateLine[]; childAge: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { text: string; on: boolean; thing?: { id: string; name: string } | null }>>({});
  const [edit, setEdit] = useState<Record<string, { text: string; on: boolean }>>({});
  const [pick, setPick] = useState<{ sec: string; q: string; list: { id: string; name: string }[] } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const run = async (f: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => { setBusy(true); setErr(null); const r = await f(); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } after?.(); router.refresh(); };
  // Relevance: the little-kid and teen blocks show only when the age fits (or the block already has lines, or "show all").
  const secs = templateSections(template.kind).filter((s) => showAll || lines.some((l) => l.section === s.id) || !((s.id === "little" && (childAge == null || childAge >= 6)) || (s.id === "teen" && (childAge == null || childAge < 12))));
  const hidden = templateSections(template.kind).length - secs.length;
  return (
    <div className="flex flex-col gap-3">
      {err && <div className="rounded-xl bg-red-bg text-red px-4 py-3 text-sm font-semibold">{err}</div>}
      {secs.map((s) => {
        const list = lines.filter((l) => l.section === s.id); const d = draft[s.id] ?? { text: "", on: true, thing: null };
        return (
          <div key={s.id} className="card flex flex-col gap-2">
            <div className="font-semibold">{s.title}{s.health && <span className="text-xs text-muted font-normal"> · off unless you tick it for a visit</span>}</div>
            <div className="text-xs text-muted">{s.hint}</div>
            {list.map((l) => {
              const e = edit[l.id];
              return (
                <div key={l.id} className="rounded-xl bg-soft p-2 flex flex-col gap-1.5">
                  <div className="flex gap-2 items-start">
                    {l.photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/thing-photo/${l.photo}?t=1`} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                    {e ? <textarea rows={2} className={inp} value={e.text} onChange={(ev) => setEdit((c) => ({ ...c, [l.id]: { ...e, text: ev.target.value } }))} /> : <div className="text-sm flex-1 whitespace-pre-wrap">{l.text}{l.thingName ? <span className="text-xs text-muted"> · {l.thingName}</span> : null}</div>}
                  </div>
                  {e ? (
                    <div className="flex gap-2 items-center flex-wrap">
                      {!l.health && <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={e.on} onChange={(ev) => setEdit((c) => ({ ...c, [l.id]: { ...e, on: ev.target.checked } }))} /> On by default</label>}
                      <button disabled={busy} onClick={() => run(() => updateTemplateLine(l.id, e.text, e.on), () => setEdit((c) => { const n = { ...c }; delete n[l.id]; return n; }))} className={btn}>Save</button>
                      <button onClick={() => setEdit((c) => { const n = { ...c }; delete n[l.id]; return n; })} className="text-xs font-semibold text-muted min-h-9 px-2">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center text-xs">
                      {!l.health && <span className="text-muted">{l.defaultOn ? "On by default" : "Off by default"}</span>}
                      <button onClick={() => setEdit((c) => ({ ...c, [l.id]: { text: l.text, on: l.defaultOn } }))} className="font-semibold text-accent min-h-9 px-1">Edit</button>
                      <button disabled={busy} onClick={() => run(() => archiveTemplateLine(l.id))} className="font-semibold text-muted min-h-9 px-1">Hide</button>
                    </div>
                  )}
                </div>
              );
            })}
            <textarea rows={2} className={inp} placeholder="Add a line" value={d.text} onChange={(e) => setDraft((c) => ({ ...c, [s.id]: { ...d, text: e.target.value } }))} />
            {(s.id === "comfort" || s.id === "house") && (
              <div className="flex flex-col gap-1.5">
                {d.thing ? <div className="text-xs">Photo from Things: <b>{d.thing.name}</b> <button onClick={() => setDraft((c) => ({ ...c, [s.id]: { ...d, thing: null } }))} className="text-muted font-bold px-1">×</button></div>
                  : <button type="button" onClick={async () => setPick({ sec: s.id, q: "", list: await listThingsForPicker("") })} className="text-xs font-semibold text-accent self-start min-h-9">Link a photo from Things</button>}
                {pick?.sec === s.id && (
                  <div className="rounded-xl border border-line p-2 flex flex-col gap-1">
                    <input className={inp} placeholder="Search your things" value={pick.q} onChange={async (e) => { const q = e.target.value; setPick({ sec: s.id, q, list: await listThingsForPicker(q) }); }} />
                    {pick.list.map((t) => <button key={t.id} onClick={() => { setDraft((c) => ({ ...c, [s.id]: { ...d, thing: t } })); setPick(null); }} className="text-left rounded-lg bg-soft px-3 py-2 text-sm">{t.name}</button>)}
                    <button onClick={() => setPick(null)} className="text-xs font-semibold text-muted self-start min-h-9">Close</button>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              {!s.health && <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={d.on} onChange={(e) => setDraft((c) => ({ ...c, [s.id]: { ...d, on: e.target.checked } }))} /> On by default</label>}
              <button disabled={busy || !d.text.trim()} onClick={() => run(() => addTemplateLine(template.id, s.id, d.text, d.thing?.id ?? null, d.on), () => setDraft((c) => ({ ...c, [s.id]: { text: "", on: true, thing: null } })))} className={btn}>Add</button>
            </div>
          </div>
        );
      })}
      {hidden > 0 && !showAll && <button onClick={() => setShowAll(true)} className="text-xs font-semibold text-muted self-start min-h-9">Show {hidden} more section{hidden === 1 ? "" : "s"} (not usual for this age)</button>}
    </div>
  );
}
