"use client";
import { useEffect, useState, type ReactNode } from "react";

// A collapsible section whose open/closed choice is remembered on this device, per section id (not per vehicle),
// so the cards someone keeps open stay open for every vehicle. Storage can be blocked; the default then applies.
export function Fold({ id, title, summary, defaultOpen = false, tone, children }: { id: string; title: string; summary?: ReactNode; defaultOpen?: boolean; tone?: "green"; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const key = `fold:${id}`;
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s === "1") setOpen(true); else if (s === "0") setOpen(false); } catch { /* default */ }
  }, [key]);
  function toggle() {
    setOpen((o) => { try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  }
  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} aria-expanded={open} className={`w-full min-h-11 flex items-center justify-between gap-3 rounded-xl px-3 text-left ${tone === "green" ? "bg-green-bg" : "bg-soft"}`}>
        <span className={`text-[11px] font-bold tracking-wide uppercase ${tone === "green" ? "text-green" : "text-muted"}`}>{title}</span>
        <span className={`flex items-center gap-2 text-xs ${tone === "green" ? "text-green" : "text-muted"}`}>{summary}<span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span></span>
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
