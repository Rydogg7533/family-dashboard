"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmNight, saveNote, endNight, cancelNight } from "@/app/sitter/actions";
import { SECTIONS, fmtWhen, type Night, type SheetItem, type SectionId } from "@/lib/sitter-shared";

// The review screen the leave-by push opens. It shows exactly what the kitchen tablet will display. Add, remove or edit for this visit only (the template is not
// changed), confirm, then optionally leave a note that shows at the top of the tablet.
export function SitterReview({ night, initial }: { night: Night; initial: SheetItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<SheetItem[]>(initial);
  const [visit, setVisit] = useState(night.visitOnly ?? "");
  const [note, setNote] = useState(night.note ?? "");
  const [add, setAdd] = useState<Partial<Record<SectionId, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(night.status === "confirmed");
  const live = confirmed;
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
  const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
  const prim = "min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50";
  const run = async (f: () => Promise<{ ok: boolean; error?: string }>, ok?: () => void) => { setBusy(true); setErr(null); setMsg(null); const r = await f(); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } ok?.(); router.refresh(); };
  const patch = (id: string, p: Partial<SheetItem>) => setItems((c) => c.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const shown = items.filter((i) => i.on).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="card text-sm">
        <div className="font-semibold">{night.title}</div>
        <div className="text-xs text-muted mt-1">{night.sitterName ? `Sitter: ${night.sitterName} · ` : ""}Leave by {fmtWhen(night.leaveAt)} · back by {fmtWhen(night.endsAt)}{night.place ? ` · ${night.place}` : ""}</div>
        <div className="text-xs mt-2">{live ? "On the kitchen tablet now. Changes below go live when you tap Update the tablet." : "Not on the tablet yet. Look it over, change what you need, then confirm."}</div>
      </div>

      {SECTIONS.map((s) => {
        const list = items.filter((i) => i.section === s.id);
        return (
          <div key={s.id} className="card flex flex-col gap-2">
            <div className="font-semibold text-sm">{s.title}{s.id === "health" && <span className="text-xs text-muted font-normal"> · off unless you tick it</span>}</div>
            {list.length === 0 && <div className="text-xs text-muted">Nothing here for tonight.</div>}
            {list.map((i) => (
              <div key={i.id} className="flex gap-2 items-start">
                <input type="checkbox" checked={i.on} onChange={(e) => patch(i.id, { on: e.target.checked })} className="mt-3 h-5 w-5 shrink-0" aria-label="Show on the tablet" />
                {i.photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/thing-photo/${i.photo}?t=1`} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 mt-0.5" />}
                <textarea rows={1} value={i.text} onChange={(e) => patch(i.id, { text: e.target.value })} className={`${inp} ${i.on ? "" : "opacity-50"}`} />
                {i.id.startsWith("new-") && <button type="button" onClick={() => setItems((c) => c.filter((x) => x.id !== i.id))} className="text-muted font-bold px-2 min-h-10" aria-label="Remove">×</button>}
              </div>
            ))}
            <div className="flex gap-2">
              <input className={inp} placeholder="Add something for tonight" value={add[s.id] ?? ""} onChange={(e) => setAdd((c) => ({ ...c, [s.id]: e.target.value }))} />
              <button type="button" disabled={!(add[s.id] ?? "").trim()} onClick={() => { setItems((c) => [...c, { id: `new-${Date.now()}-${c.length}`, section: s.id, text: (add[s.id] ?? "").trim(), photo: null, on: true }]); setAdd((c) => ({ ...c, [s.id]: "" })); }} className={btn}>Add</button>
            </div>
          </div>
        );
      })}

      <div className="card flex flex-col gap-2">
        <div className="font-semibold text-sm">Just for tonight</div>
        <textarea rows={2} className={inp} placeholder="Door code, Wi-Fi password, anything that should not be saved" value={visit} onChange={(e) => setVisit(e.target.value)} />
        <div className="text-[11px] text-muted">Shown on the tablet in its own box and erased automatically when the night ends. It is never added to your saved sheet.</div>
      </div>

      {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
      {msg && <div className="text-sm text-green font-semibold">{msg}</div>}
      <button disabled={busy || shown === 0} onClick={() => run(() => confirmNight(night.id, items, visit), () => { setConfirmed(true); setMsg(live ? "The tablet is updated." : "Confirmed. It is on the tablet now."); })} className={prim}>{busy ? "Saving…" : live ? "Update the tablet" : `Confirm and show ${shown} item${shown === 1 ? "" : "s"} on the tablet`}</button>

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
        <button disabled={busy} onClick={() => run(() => cancelNight(night.id), () => router.push("/"))} className="min-h-10 px-3 text-xs font-semibold text-muted">The sitter is not coming</button>
      </div>
    </div>
  );
}
