"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctRead } from "@/app/inbox/read";
import { amendDecided } from "@/app/inbox/amend";
import { CATEGORIES, FIELD_LABEL, categoryLabel, type Corrections, type EditableField } from "@/lib/read-correction";

export type ReadShape = { kind?: string; vendor?: string | null; amount?: number | null; date?: string | null; item?: string | null; category?: string | null; corrections?: Corrections };
const ORDER: EditableField[] = ["vendor", "amount", "date", "item", "category"];

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function show(f: EditableField, v: unknown): string {
  if (v == null || v === "") return "";
  if (f === "amount") return typeof v === "number" ? `$${v.toFixed(2)}` : `$${v}`;
  if (f === "date") return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? day(v) : String(v);
  if (f === "category") return categoryLabel(v);
  return String(v);
}

// "What I read": every field the reader found, tappable. A blank is highlighted. Fixing a field rebuilds the plan from the corrected facts without reading the file again;
// the reader's first value is kept and shown as "was ...".
export function ReadFields({ id, rr, decided = false }: { id: string; rr: ReadShape; decided?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function begin(f: EditableField) {
    setError(null); setEditing(f);
    const cur = rr[f];
    setVal(cur == null ? (f === "category" ? "other" : "") : String(cur));
  }
  async function save() {
    if (!editing) return;
    setBusy(true); setError(null);
    const r = await (decided ? amendDecided : correctRead)(id, editing, val).catch(() => ({ ok: false, error: "That did not save. Try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "That did not save."); return; }
    setEditing(null); router.refresh();
  }

  return (
    <div className="rounded-xl border border-line px-3 pt-2 pb-1">
      <div className="text-[11px] font-bold tracking-wide text-muted">WHAT I READ <span className="font-normal normal-case tracking-normal">· {decided ? "fixing a filed receipt changes its record and name" : "tap the pencil to fix anything wrong"}</span></div>
      {ORDER.map((f) => {
        const cur = rr[f];
        const empty = cur == null || cur === "";
        const fixed = rr.corrections?.[f];
        const orig = fixed ? show(f, fixed.original) : "";
        if (editing === f) {
          return (
            <form key={f} onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-2 py-2 border-t border-line">
              <label className="text-xs font-semibold text-muted" htmlFor={`rf-${id}-${f}`}>{FIELD_LABEL[f]}</label>
              {f === "category"
                ? <select id={`rf-${id}-${f}`} value={val} onChange={(e) => setVal(e.target.value)} className="min-h-11 rounded-xl border border-line bg-bg px-2 text-sm">{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                : <input id={`rf-${id}-${f}`} autoFocus value={val} onChange={(e) => setVal(e.target.value)} type={f === "date" ? "date" : "text"} inputMode={f === "amount" ? "decimal" : undefined} placeholder={f === "amount" ? "86.40" : undefined} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm" />}
              {error && <div role="alert" className="text-xs text-red">{error}</div>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !val.trim()} className="min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
                <button type="button" disabled={busy} onClick={() => setEditing(null)} className="min-h-11 px-4 rounded-xl border border-line text-sm font-semibold">Cancel</button>
              </div>
            </form>
          );
        }
        return (
          <div key={f} className="flex items-center gap-2 min-h-11 border-t border-line">
            <span className="w-[72px] shrink-0 text-xs text-muted">{FIELD_LABEL[f]}</span>
            <span className="flex-1 min-w-0 text-sm">
              {empty ? <span className="inline-block rounded-md border border-dashed border-amber bg-soft px-2 py-0.5 text-xs font-semibold text-amber">Not read: add it</span> : <span className="font-medium break-words">{show(f, cur)}</span>}
              {fixed && <span className="block text-[11px] text-muted">you changed this{orig ? ` (was ${orig})` : ""}</span>}
            </span>
            <button type="button" aria-label={`Edit ${FIELD_LABEL[f].toLowerCase()}`} onClick={() => begin(f)} className="w-11 h-11 shrink-0 flex items-center justify-center text-muted">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
