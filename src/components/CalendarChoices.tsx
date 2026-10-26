"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCalendarShown } from "@/app/calendar/choices-actions";

export type ChoiceRow = { id: string; name: string; color: string | null; shown: boolean; role: string; isNew: boolean; canWrite: boolean };

const ROLE_LABEL: Record<string, string> = { default: "Default", suggestions: "Suggestions" };

// One row per calendar in the slide-in panel. Ticking saves at once; the page behind refreshes so the
// week and the agenda change under the panel while it is still open.
export function CalendarChoiceRow({ c }: { c: ChoiceRow }) {
  const router = useRouter();
  const [on, setOn] = useState(c.shown);
  const [err, setErr] = useState(false);
  const [, start] = useTransition();
  const toggle = (next: boolean) => {
    setOn(next); setErr(false);
    start(async () => {
      const r = await setCalendarShown(c.id, next, c.name, c.color);
      if (!r.ok) { setOn(!next); setErr(true); return; }
      router.refresh();
    });
  };
  return (
    <label className="flex items-center gap-3 min-h-12 px-3 border-b border-line last:border-b-0">
      <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="w-5 h-5 shrink-0 accent-[var(--accent)]" />
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color ?? "var(--muted)" }} />
      <span className={`flex-1 min-w-0 truncate text-sm ${on ? "" : "text-muted"}`}>{c.name}</span>
      {err && <span className="text-[11px] font-bold text-red shrink-0">Not saved</span>}
      {!err && c.isNew && <span className="text-[11px] font-bold text-amber shrink-0">New</span>}
      {!err && !c.isNew && ROLE_LABEL[c.role] && <span className="text-[11px] text-muted shrink-0">{ROLE_LABEL[c.role]}</span>}
    </label>
  );
}
