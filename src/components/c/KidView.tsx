"use client";
import { useState } from "react";
import { useToast } from "@/components/c/Toast";

type Item = { id: string; label: string; done: boolean; weather?: boolean };
const row = (hl?: boolean) => `flex items-center gap-3 min-h-12 px-3.5 rounded-xl border ${hl ? "border-amber bg-amber-bg" : "border-line"}`;

export function KidChecklist({ title, items: initial }: { title: string; items: Item[] }) {
  const [items, setItems] = useState(initial);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[17px]">{title}</h2>
      {items.map((i) => (
        <label key={i.id} className={row(i.weather)}>
          <input type="checkbox" className="w-6 h-6" checked={i.done} onChange={() => setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} />
          <span className="text-base">{i.label}{i.weather && <span className="text-xs text-amber font-semibold ml-1">(weather)</span>}</span>
        </label>
      ))}
    </section>
  );
}

export function MessageParent() {
  const [open, setOpen] = useState(false);
  const { show, el } = useToast();
  const quick = ["Can you pick me up?", "I'm done", "I need help", "Running late"];
  return (
    <section className="flex flex-col gap-2">
      <button className="w-full min-h-14 rounded-xl bg-accent text-white font-bold text-base" onClick={() => setOpen((v) => !v)}>Message a parent</button>
      {open && (
        <div className="card flex flex-col gap-1.5">
          {quick.map((q) => <button key={q} className="min-h-11 rounded-lg border border-line text-left px-3 font-semibold text-sm hover:bg-soft" onClick={() => { setOpen(false); show(`Sent to Mom and Dad: “${q}”`); }}>{q}</button>)}
          <div className="text-xs text-muted">Goes to both parents in Messages. Your page does not show Messages; use the Messages app to read replies.</div>
        </div>
      )}
      {el}
    </section>
  );
}
