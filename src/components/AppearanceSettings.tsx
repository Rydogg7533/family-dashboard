"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { ACCENTS, DEFAULT_APPEARANCE, FONTS, PRESETS, type Appearance } from "@/lib/appearance";
import { Toast, useToast } from "@/components/Toast";

const MY_PRESET_KEY = "fd.appearance.mypreset.v1";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="py-3 border-b border-line last:border-b-0">
      <div className="flex items-baseline justify-between mb-2"><div className="font-semibold text-sm">{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div>
      {children}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={o.v === value}
          className={`min-h-10 px-3.5 rounded-full text-sm font-semibold border ${o.v === value ? "bg-accent text-white border-accent" : "bg-soft border-transparent text-fg"}`}>{o.label}</button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center justify-between w-full min-h-10">
      <span className="font-semibold text-sm">{label}</span>
      <span className={`relative inline-block w-12 h-7 rounded-full ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function AppearanceSettings() {
  const { a, set, reset } = useAppearance();
  const { toast, show, clear } = useToast();
  const [hasMine, setHasMine] = useState(false);
  const [photoDraft, setPhotoDraft] = useState("");
  useEffect(() => { try { setHasMine(Boolean(localStorage.getItem(MY_PRESET_KEY))); } catch {} }, []);
  useEffect(() => { setPhotoDraft(a.photoUrl ?? ""); }, [a.photoUrl]);

  const change = useCallback((p: Partial<Appearance>, label: string) => {
    const before: Partial<Appearance> = {};
    (Object.keys(p) as (keyof Appearance)[]).forEach((k) => { (before as Record<string, unknown>)[k] = a[k]; });
    set({ ...p, preset: undefined });
    show(`${label} saved`, () => set(before));
  }, [a, set, show]);

  const applyPreset = (name: string) => {
    const snapshot = { ...a };
    let p: Partial<Appearance> | null = PRESETS[name] ?? null;
    if (name === "My preset") { try { p = JSON.parse(localStorage.getItem(MY_PRESET_KEY) ?? "null"); } catch {} }
    if (!p) return;
    set({ ...DEFAULT_APPEARANCE, ...p, greetingName: a.greetingName, preset: name });
    show(`Preset "${name}" applied`, () => set(snapshot));
  };
  const saveMine = () => { try { localStorage.setItem(MY_PRESET_KEY, JSON.stringify({ ...a, preset: undefined })); setHasMine(true); set({ preset: "My preset" }); show("Saved as my preset"); } catch {} };
  const resetAll = () => { const snapshot = { ...a }; reset(); show("Reset to Classic", () => set(snapshot)); };

  const greeting = a.greetingName ? `Good morning, ${a.greetingName}` : "Good morning";
  const firstLine = a.firstLine === "date" ? new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : a.firstLine === "weather" ? "62° and clear in Orem" : a.firstLine === "quote" ? "“Silence means healthy.”" : null;

  return (
    <>
      {/* Live preview: real .card so card style, density and radius apply */}
      <div className="card mb-4" aria-label="Preview">
        <div className="text-[11px] font-bold tracking-wide text-muted mb-1">PREVIEW</div>
        <h2 className="text-xl leading-tight">{greeting}</h2>
        {firstLine && <div className="text-sm text-muted">{firstLine}</div>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div><div className="text-[11px] font-bold tracking-wide text-accent">DO</div><div className="font-semibold">Sign the field-trip form</div><div className="text-xs text-muted">From email · due Friday</div></div>
          <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-amber-bg text-amber">in 4 days</span>
        </div>
        <div className="mt-3 flex gap-2"><span className="min-h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center">Done</span><span className="min-h-10 px-4 rounded-xl border border-line text-sm font-semibold inline-flex items-center">Snooze</span></div>
      </div>

      <div className="card !py-1">
        <Field label="Presets" hint={a.preset ? `Using ${a.preset}` : "Custom"}>
          <div className="flex gap-1.5 flex-wrap">
            {[...Object.keys(PRESETS), ...(hasMine ? ["My preset"] : [])].map((n) => (
              <button key={n} type="button" onClick={() => applyPreset(n)} className={`min-h-10 px-3.5 rounded-full text-sm font-semibold border ${a.preset === n ? "bg-accent text-white border-accent" : "bg-soft border-transparent"}`}>{n}</button>
            ))}
          </div>
          <div className="flex gap-2 mt-2.5">
            <button type="button" onClick={saveMine} className="min-h-10 px-3.5 rounded-xl border border-line text-sm font-semibold">Save as my preset</button>
            <button type="button" onClick={resetAll} className="min-h-10 px-3.5 rounded-xl text-sm font-semibold text-muted">Reset</button>
          </div>
        </Field>

        <Field label="Theme">
          <Seg value={a.theme} onChange={(v) => change({ theme: v }, "Theme")} options={[{ v: "auto", label: "Follow device" }, { v: "light", label: "Light" }, { v: "dark", label: "Dark" }]} />
        </Field>

        <Field label="Accent" hint={ACCENTS.find((c) => c.hex.toLowerCase() === a.accent.toLowerCase())?.name ?? "Custom"}>
          <div className="flex gap-2 flex-wrap items-center">
            {ACCENTS.map((c) => (
              <button key={c.hex} type="button" title={c.name} aria-label={c.name} aria-pressed={c.hex.toLowerCase() === a.accent.toLowerCase()} onClick={() => change({ accent: c.hex }, `Accent ${c.name}`)}
                className={`w-10 h-10 rounded-full border-2 ${c.hex.toLowerCase() === a.accent.toLowerCase() ? "border-fg scale-110" : "border-transparent"}`} style={{ background: c.hex }} />
            ))}
            <label className="w-10 h-10 rounded-full border-2 border-dashed border-line flex items-center justify-center text-xs font-bold text-muted cursor-pointer overflow-hidden relative" title="Custom">
              +<input type="color" value={a.accent} onChange={(e) => change({ accent: e.target.value }, "Custom accent")} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Custom accent color" />
            </label>
          </div>
        </Field>

        <Field label="Text size">
          <Seg value={a.textSize} onChange={(v) => change({ textSize: v }, "Text size")} options={[{ v: "s", label: "S" }, { v: "m", label: "M" }, { v: "l", label: "L" }, { v: "xl", label: "XL" }]} />
        </Field>
        <Field label="Density">
          <Seg value={a.density} onChange={(v) => change({ density: v }, "Density")} options={[{ v: "comfortable", label: "Comfortable" }, { v: "compact", label: "Compact" }]} />
        </Field>
        <Field label="Card style">
          <Seg value={a.cardStyle} onChange={(v) => change({ cardStyle: v }, "Card style")} options={[{ v: "bordered", label: "Bordered" }, { v: "filled", label: "Filled" }, { v: "flat", label: "Flat" }]} />
        </Field>
        <Field label="Corners">
          <Seg value={a.radius} onChange={(v) => change({ radius: v }, "Corners")} options={[{ v: "square", label: "Square" }, { v: "soft", label: "Soft" }, { v: "round", label: "Round" }]} />
        </Field>

        <Field label="Font pairing">
          <div className="flex flex-col gap-1">
            {(Object.keys(FONTS) as Appearance["font"][]).map((k) => (
              <button key={k} type="button" onClick={() => change({ font: k }, "Font")} aria-pressed={a.font === k}
                className={`flex items-center justify-between min-h-11 px-3 rounded-xl text-left ${a.font === k ? "bg-accent text-white" : "bg-soft"}`}>
                <span className="font-semibold text-sm" style={{ fontFamily: FONTS[k].display }}>{FONTS[k].name}</span>
                <span className="text-xs opacity-80" style={{ fontFamily: FONTS[k].body }}>Aa 123</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Background">
          <Seg value={a.background} onChange={(v) => change({ background: v }, "Background")} options={[{ v: "plain", label: "Plain" }, { v: "gradient", label: "Gradient" }, { v: "mesh", label: "Mesh" }, { v: "photo", label: "Photo" }]} />
          {a.background === "photo" && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input value={photoDraft} onChange={(e) => setPhotoDraft(e.target.value)} placeholder="https://… (your photo URL)" inputMode="url" className="flex-1 min-h-10 px-3 rounded-xl border border-line bg-bg text-sm" aria-label="Photo URL" />
                <button type="button" onClick={() => change({ photoUrl: photoDraft.trim() || undefined }, "Photo")} className="min-h-10 px-3.5 rounded-xl bg-accent text-white text-sm font-semibold">Use</button>
              </div>
              <label className="text-xs text-muted flex items-center gap-3">Dim <input type="range" min={0} max={80} value={a.backgroundDim} onChange={(e) => set({ backgroundDim: Number(e.target.value) })} onPointerUp={() => show("Dim saved")} className="flex-1 accent-[var(--accent)]" aria-label="Background dim" /> {a.backgroundDim}%</label>
              <div className="text-xs text-muted">Photo of the day from the family library: later, once Photos is connected.</div>
            </div>
          )}
        </Field>

        <Field label="Greeting">
          <input value={a.greetingName} onChange={(e) => set({ greetingName: e.target.value })} onBlur={() => show("Greeting name saved")} placeholder="Name shown (blank for none)" className="w-full min-h-10 px-3 rounded-xl border border-line bg-bg text-sm mb-2" aria-label="Greeting name" />
          <Seg value={a.firstLine} onChange={(v) => change({ firstLine: v }, "First line")} options={[{ v: "date", label: "Date" }, { v: "weather", label: "Weather" }, { v: "quote", label: "Quote" }, { v: "none", label: "None" }]} />
        </Field>

        <Field label="Motion">
          <Switch on={a.reduceMotion} onChange={(v) => change({ reduceMotion: v }, "Reduce motion")} label="Reduce motion" />
        </Field>
      </div>

      <p className="text-xs text-muted mt-4">Saved on this device as you tap; synced to your profile later. Amber and red statuses stay amber and red in every theme. Children can pick a preset.</p>
      <Toast toast={toast} onDone={clear} />
    </>
  );
}
