"use client";
import { useState, useTransition } from "react";
import { DEFAULT_TABS, FIXED_MAX, TAB_CATALOG, TAB_GROUPS, resolveTabs, type TabKey } from "@/lib/tabs";
import { MoreIcon } from "@/components/MoreIcons";
import { saveTabBar } from "@/app/settings/tabs/actions";

// Checklist of the catalog with up/down to order. Saved on each change; the bar re-renders on the next navigation.
export function TabBarSettings({ initial }: { initial: TabKey[] }) {
  const [keys, setKeys] = useState<TabKey[]>(resolveTabs(initial).map((t) => t.key).filter((k) => k !== "more"));
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const apply = (next: TabKey[]) => { setKeys(next); start(async () => { const r = await saveTabBar([...next, "more"]); setNote(r.ok ? "Saved" : r.error ?? "Could not save"); }); };
  const toggle = (k: TabKey) => apply(keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k]);
  const move = (k: TabKey, d: -1 | 1) => { const i = keys.indexOf(k), j = i + d; if (i < 0 || j < 0 || j >= keys.length) return; const n = [...keys]; [n[i], n[j]] = [n[j], n[i]]; apply(n); };
  const onBar = keys.map((k) => TAB_CATALOG.find((t) => t.key === k)!);
  const off = TAB_CATALOG.filter((t) => t.key !== "more" && !keys.includes(t.key));
  const Row = ({ k, on, i }: { k: typeof TAB_CATALOG[number]; on: boolean; i?: number }) => (
    <li className="flex items-center gap-3 py-2.5 border-b border-line/60 last:border-0">
      <button type="button" onClick={() => toggle(k.key)} aria-pressed={on} className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? "bg-accent border-accent text-white" : "border-muted"}`}>{on ? "✓" : ""}</button>
      <span className={`flex items-center justify-center w-9 h-9 rounded-full ${on ? "bg-accent/12 text-accent" : "bg-soft text-muted"}`}><MoreIcon name={k.icon} size={20} /></span>
      <span className="flex-1 font-semibold">{k.label}</span>
      {on && i !== undefined && (
        <span className="flex gap-1">
          <button type="button" aria-label={`Move ${k.label} up`} disabled={i === 0} onClick={() => move(k.key, -1)} className="min-w-9 min-h-9 rounded-lg hover:bg-soft disabled:opacity-30 font-bold">↑</button>
          <button type="button" aria-label={`Move ${k.label} down`} disabled={i === onBar.length - 1} onClick={() => move(k.key, 1)} className="min-w-9 min-h-9 rounded-lg hover:bg-soft disabled:opacity-30 font-bold">↓</button>
        </span>
      )}
    </li>
  );
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted mb-1">On the bar{onBar.length > FIXED_MAX - 1 ? ` · ${onBar.length + 1} tabs, scrolls on a phone` : ""}</h2>
      <ul className="mb-5">{onBar.map((k, i) => <Row key={k.key} k={k} on i={i} />)}
        <li className="flex items-center gap-3 py-2.5 text-muted"><span className="w-6" /><span className="flex items-center justify-center w-9 h-9 rounded-full bg-soft"><MoreIcon name="grid" size={20} /></span><span className="flex-1 font-semibold">More <span className="font-normal">· always last</span></span></li>
      </ul>
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted mb-1">Under More</h2>
      {TAB_GROUPS.map((g) => { const rows = off.filter((k) => (k.group ?? "core") === g.id); return rows.length ? (
        <div key={g.id} className="mb-4">
          <div className="text-[11px] font-semibold text-muted mt-2 mb-0.5">{g.label}</div>
          <ul>{rows.map((k) => <Row key={k.key} k={k} on={false} />)}</ul>
        </div>) : null; })}
      <div className="flex items-center gap-3 text-sm">
        <button type="button" onClick={() => apply(DEFAULT_TABS.filter((k) => k !== "more"))} className="font-semibold text-accent">Reset to default</button>
        <span className="text-muted">{pending ? "Saving…" : note}</span>
      </div>
    </div>
  );
}
