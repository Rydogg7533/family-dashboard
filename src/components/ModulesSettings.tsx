"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MODULES, MODULE_PRESETS, RECOMMENDED, loadModules, saveModules, type ModulesState } from "@/lib/modules";
import { Toast, useToast } from "@/components/Toast";

function Switch({ on, onChange, label, note, href }: { on: boolean; onChange: (v: boolean) => void; label: string; note: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-12 py-2 border-b border-line last:border-b-0">
      <div className="min-w-0">
        <div className="font-semibold truncate">{href ? <Link href={href}>{label}</Link> : label}</div>
        <div className="text-xs text-muted">{note}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative inline-block w-12 h-7 rounded-full shrink-0 ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export function ModulesSettings() {
  const [s, setS] = useState<ModulesState>(RECOMMENDED);
  const [ready, setReady] = useState(false);
  const { toast, show, clear } = useToast();
  useEffect(() => { setS(loadModules()); setReady(true); }, []);

  const commit = (next: ModulesState, text: string) => { const prev = s; setS(next); saveModules(next); show(text, () => { setS(prev); saveModules(prev); }); };
  const toggle = (id: string, on: boolean) => {
    const def = MODULES.find((m) => m.id === id)!;
    const set = new Set(s.on); if (on) set.add(id); else set.delete(id);
    commit({ on: [...set], preset: undefined }, `${def.label} ${on ? "on" : "off"}`);
  };
  const preset = (name: string) => commit({ on: MODULE_PRESETS[name], preset: name }, `Preset "${name}" applied`);
  const isOn = (id: string) => s.on.includes(id);
  const onNow = MODULES.filter((m) => m.tier !== "fixed" && isOn(m.id));
  const available = MODULES.filter((m) => m.tier !== "fixed" && !isOn(m.id));
  const hiddenWithDeadlines = ["vehicles", "home", "devices"].filter((id) => !isOn(id) && MODULES.find((m) => m.id === id)!.tier !== "off");

  return (
    <>
      <div className="mb-4">
        <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">START FROM A PRESET</div>
        <div className="flex gap-1.5 flex-wrap">
          {Object.keys(MODULE_PRESETS).map((n) => (
            <button key={n} type="button" onClick={() => preset(n)} aria-pressed={s.preset === n} className={`min-h-10 px-3.5 rounded-full text-sm font-semibold border ${s.preset === n ? "bg-accent text-white border-accent" : "bg-soft border-transparent"}`}>{n}</button>
          ))}
          <button type="button" onClick={() => commit(RECOMMENDED, "Reset to recommended")} className="min-h-10 px-3.5 rounded-full text-sm font-semibold text-muted">Reset to recommended</button>
        </div>
      </div>

      <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">FIXED · ALWAYS ON</div>
      <div className="card !py-0 mb-4">
        {MODULES.filter((m) => m.tier === "fixed").map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 min-h-12 py-2 border-b border-line last:border-b-0">
            <div className="min-w-0"><div className="font-semibold">{m.href ? <Link href={m.href}>{m.label}</Link> : m.label}</div><div className="text-xs text-muted">{m.note}</div></div>
            <span className="text-xs font-bold text-muted shrink-0" title="Cannot be turned off">Locked</span>
          </div>
        ))}
      </div>

      <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">ON</div>
      <div className="card !py-0 mb-4">
        {ready && onNow.length === 0 && <div className="text-sm text-muted py-3">Nothing optional is on.</div>}
        {onNow.map((m) => <Switch key={m.id} on onChange={(v) => toggle(m.id, v)} label={m.label} note={m.note} href={m.href} />)}
      </div>

      <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">AVAILABLE</div>
      <div className="card !py-0 mb-4">
        {ready && available.length === 0 && <div className="text-sm text-muted py-3">Everything is on.</div>}
        {available.map((m) => <Switch key={m.id} on={false} onChange={(v) => toggle(m.id, v)} label={m.label} note={m.note} href={m.href} />)}
      </div>

      <p className="text-xs text-muted">
        Turning a module off hides it; its data and reminders are kept, and anything urgent still reaches Today as one line{hiddenWithDeadlines.length ? ` (for example "${MODULES.find((m) => m.id === hiddenWithDeadlines[0])!.label}: due in 7 days (module hidden)")` : ""}. Changes to a child&apos;s modules are made by a parent and logged. Reordering sections: later.
      </p>
      <Toast toast={toast} onDone={clear} />
    </>
  );
}
