"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmNight, saveNote, endNight, cancelNight, recompileNight, bookNight } from "@/app/sitter/actions";
import { fmtWhen, groupSheet, type Night, type SheetItem } from "@/lib/sitter-shared";
import type { ChoiceOptions, Choices } from "@/lib/sitter-compile";

// The review screen: exactly what the kitchen tablet will display, compiled from the household card, the chosen general
// template and each child's template. Defaults are already applied, so a booked night is one tap; "Instructions" opens
// only if the parent wants a different set or a child is away. Edits here are for this visit only. A needed night (no sitter
// yet) saves a draft instead of confirming.
export function SitterReview({ night, initial, choices, options, from }: { night: Night; initial: SheetItem[]; choices: Choices; options: ChoiceOptions; from: "saved" | "last" | "defaults" }) {
  const router = useRouter();
  const [items, setItems] = useState<SheetItem[]>(initial);
  const [ch, setCh] = useState<Choices>(choices);
  const [showChoices, setShowChoices] = useState(false);
  const [showTonight, setShowTonight] = useState(!!(night.visitOnly || night.lines.length));
  const [visit, setVisit] = useState(night.visitOnly ?? "");
  const [line, setLine] = useState("");
  const [note, setNote] = useState(night.note ?? "");
  const [sitter, setSitter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(night.status === "confirmed");
  const needed = night.status === "needed";
  const live = confirmed;
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
  const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
  const prim = "min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50";
  const run = async (f: () => Promise<{ ok: boolean; error?: string }>, ok?: () => void) => { setBusy(true); setErr(null); setMsg(null); const r = await f(); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } ok?.(); router.refresh(); };
  const patch = (id: string, p: Partial<SheetItem>) => setItems((c) => c.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const shown = items.filter((i) => i.on).length;
  const groups = groupSheet(items);

  // Changing a template or who is home recompiles; hand-made lines for tonight are kept.
  const recompile = async (next: Choices) => {
    setCh(next); setBusy(true); setErr(null);
    const r = await recompileNight(next); setBusy(false);
    if (!r.ok || !r.items) { setErr(r.error ?? "Could not rebuild the sheet."); return; }
    const kept = items.filter((i) => i.id.startsWith("new-"));
    setItems([...r.items, ...kept]);
  };
  const gName = options.general.find((t) => t.id === ch.generalTemplateId)?.name ?? "no house template";
  const kidsLine = options.children.length
    ? options.children.map((c) => ch.childrenHome.includes(c.id) ? `${c.name}: ${c.templates.find((t) => t.id === ch.childTemplates[c.id])?.name ?? "no template"}` : `${c.name} away`).join(" · ")
    : "no children set up";

  return (
    <div className="flex flex-col gap-3">
      <div className="card text-sm">
        <div className="font-semibold">{night.title}</div>
        <div className="text-xs text-muted mt-1">{night.sitterName ? `Sitter: ${night.sitterName} · ` : needed ? "No sitter yet · " : ""}Leave by {fmtWhen(night.leaveAt)} · back by {fmtWhen(night.endsAt)}{night.place ? ` · ${night.place}` : ""}</div>
        <div className="text-xs mt-2">{needed ? "Still looking for a sitter. You can get the sheet ready now; it goes to the tablet once someone is booked and you confirm." : live ? "On the kitchen tablet now. Changes below go live when you tap Update the tablet." : "Not on the tablet yet. Look it over, change what you need, then confirm."}</div>
      </div>

      {needed && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold text-sm">Found someone?</div>
          <div className="flex gap-2"><input className={inp} placeholder="Sitter’s name" value={sitter} onChange={(e) => setSitter(e.target.value)} /><button disabled={busy || !sitter.trim()} onClick={() => run(() => bookNight(night.id, sitter), () => setMsg(`${sitter.trim()} is booked. Confirm the sheet below when you are ready.`))} className={btn}>Booked</button></div>
        </div>
      )}

      <div className="card flex flex-col gap-2">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="font-semibold text-sm">Instructions{from === "last" ? <span className="text-xs text-muted font-normal"> · same as last time with {night.sitterName ?? "this sitter"}</span> : null}</div>
            <div className="text-xs text-muted">{gName} · {kidsLine}</div>
          </div>
          <button type="button" onClick={() => setShowChoices((v) => !v)} className="text-xs font-semibold text-accent min-h-9 shrink-0">{showChoices ? "Done" : "Change"}</button>
        </div>
        {showChoices && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted">House<select className={inp} value={ch.generalTemplateId ?? ""} onChange={(e) => recompile({ ...ch, generalTemplateId: e.target.value || null })}><option value="">None</option>{options.general.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}</select></label>
            {options.children.map((c) => (
              <div key={c.id} className="flex gap-2 items-end">
                <label className="text-xs flex items-center gap-1.5 min-h-10 shrink-0"><input type="checkbox" checked={ch.childrenHome.includes(c.id)} onChange={(e) => recompile({ ...ch, childrenHome: e.target.checked ? [...ch.childrenHome, c.id] : ch.childrenHome.filter((x) => x !== c.id) })} /> {c.name} home</label>
                {ch.childrenHome.includes(c.id) && <select className={inp} value={ch.childTemplates[c.id] ?? ""} onChange={(e) => recompile({ ...ch, childTemplates: { ...ch.childTemplates, [c.id]: e.target.value } })}><option value="">No template</option>{c.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}</select>}
              </div>
            ))}
            {options.general.length === 0 && <div className="text-xs text-muted">No templates yet: Settings › Sitter › General.</div>}
          </div>
        )}
      </div>

      {groups.length === 0 && <div className="card text-sm text-muted">Nothing is on the sheet yet. Fill in Settings › Sitter (the emergency card and a template) and this page builds itself.</div>}
      {groups.map((g) => (
        <div key={g.section} className="card flex flex-col gap-2">
          <div className="font-semibold text-sm">{g.label}{g.health && <span className="text-xs text-muted font-normal"> · off unless you tick it</span>}</div>
          {g.items.map((i) => (
            <div key={i.id} className="flex gap-2 items-start">
              <input type="checkbox" checked={i.on} onChange={(e) => patch(i.id, { on: e.target.checked })} className="mt-3 h-5 w-5 shrink-0" aria-label="Show on the tablet" />
              {i.photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/thing-photo/${i.photo}?t=1`} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 mt-0.5" />}
              <textarea rows={1} value={i.text} onChange={(e) => patch(i.id, { text: e.target.value })} className={`${inp} ${i.on ? "" : "opacity-50"}`} />
              {i.id.startsWith("new-") && <button type="button" onClick={() => setItems((c) => c.filter((x) => x.id !== i.id))} className="text-muted font-bold px-2 min-h-10" aria-label="Remove">×</button>}
            </div>
          ))}
        </div>
      ))}

      <div className="card flex flex-col gap-2">
        <div className="flex justify-between items-center"><div className="font-semibold text-sm">Tonight only</div>{!showTonight && <button type="button" onClick={() => setShowTonight(true)} className="text-xs font-semibold text-accent min-h-9">+ add details</button>}</div>
        {showTonight && (<>
          <div className="flex gap-2">
            <input className={inp} placeholder="Something for tonight (pizza in the fridge, bedtime 9, no dessert)" value={line} onChange={(e) => setLine(e.target.value)} />
            <button type="button" disabled={!line.trim()} onClick={() => { setItems((c) => [...c, { id: `new-${Date.now()}-${c.length}`, section: "tonight", label: "Tonight", text: line.trim(), photo: null, on: true }]); setLine(""); }} className={btn}>Add</button>
          </div>
          {!needed && (<>
            <textarea rows={2} className={inp} placeholder="Just for tonight: door code, Wi-Fi password, anything that should not be saved" value={visit} onChange={(e) => setVisit(e.target.value)} />
            <div className="text-[11px] text-muted">The last box shows on the tablet in its own panel and is erased when the night ends. It is never saved to a template.</div>
          </>)}
        </>)}
      </div>

      {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
      {msg && <div className="text-sm text-green font-semibold">{msg}</div>}
      <button disabled={busy || (shown === 0 && !needed)} onClick={() => run(() => confirmNight(night.id, items, visit, { ...ch, lines: items.filter((i) => i.section === "tonight" && i.on).map((i) => i.text) }), () => { if (!needed) setConfirmed(true); setMsg(needed ? "Draft saved. It will be here when a sitter is booked." : live ? "The tablet is updated." : "Confirmed. It is on the tablet now."); })} className={prim}>{busy ? "Saving…" : needed ? "Save draft" : live ? "Update the tablet" : `Confirm: ${shown} item${shown === 1 ? "" : "s"} on the tablet`}</button>

      {live && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold text-sm">Note for the sitter</div>
          <textarea rows={3} className={inp} placeholder="Pizza is in the freezer. Call me if she won’t settle." value={note} onChange={(e) => setNote(e.target.value)} />
          <button disabled={busy} onClick={() => run(() => saveNote(night.id, note), () => setMsg(note.trim() ? "The note is on the tablet." : "The note was cleared."))} className={btn}>{night.note ? "Update the note" : "Put the note on the tablet"}</button>
          <div className="text-[11px] text-muted">The tablet checks for changes every 30 seconds.</div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {live && <button disabled={busy} onClick={() => run(() => endNight(night.id), () => router.push("/"))} className={btn}>End the visit now</button>}
        <button disabled={busy} onClick={() => run(() => cancelNight(night.id), () => router.push("/"))} className="min-h-10 px-3 text-xs font-semibold text-muted">{needed ? "Don’t need a sitter after all" : "The sitter is not coming"}</button>
      </div>
    </div>
  );
}
