// Shared pieces for slice A pages (settings, registers, family). Server-safe.
import Link from "next/link";
import type { ReactNode } from "react";
import { dueState, dueText, fmtDate } from "@/lib/a-shared";

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5 mt-5 first:mt-0 [section>&:first-child]:mt-5">
      <div className="text-[11px] font-bold tracking-wide text-muted uppercase">{children}</div>
      {right && <div className="text-xs text-muted">{right}</div>}
    </div>
  );
}

export function Row({ href, label, note, right, sub }: { href: string; label: ReactNode; note?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  const inner = (
    <>
      <div className="min-w-0">
        <div className="font-semibold truncate">{label}</div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted shrink-0">{right ?? note}<span aria-hidden>›</span></div>
    </>
  );
  const cls = "flex justify-between items-center gap-3 min-h-12 py-2 border-b border-line last:border-b-0";
  return href.startsWith("#") ? <a href={href} className={cls}>{inner}</a> : <Link href={href} className={cls}>{inner}</Link>;
}

export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="card !py-0 flex flex-col">{children}</div>;
}

export function OpenIn({ label, href, className = "" }: { label: string; href: string; className?: string }) {
  const inner = <>Open in {label} <span aria-hidden>›</span></>;
  const cls = `text-xs font-semibold text-accent ${className}`;
  return href.startsWith("#") || href.startsWith("http") ? <a href={href} className={cls}>{inner}</a> : <Link href={href} className={cls}>{inner}</Link>;
}

export function DueChip({ date, warnDays = 30 }: { date: string | null; warnDays?: number }) {
  const s = dueState(date, warnDays);
  const cls = s === "error" ? "bg-red-bg text-red" : s === "warn" ? "bg-amber-bg text-amber" : s === "ok" ? "bg-green-bg text-green" : "bg-soft text-muted";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{dueText(date)}</span>;
}

export function StatusDot({ state }: { state: "ok" | "warn" | "error" | "unknown" | "syncing" }) {
  const cls = state === "ok" ? "bg-green" : state === "warn" ? "bg-amber" : state === "error" ? "bg-red" : state === "syncing" ? "bg-accent animate-pulse" : "bg-muted";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} aria-label={state} />;
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted text-xs pt-0.5">{k}</dt><dd className="min-w-0">{v}</dd></div>)}
    </dl>
  );
}

export function DateCell({ iso }: { iso: string | null }) { return <span>{fmtDate(iso)}</span>; }

export function PageSources({ items }: { items: { label: string; href: string }[] }) {
  return (
    <section className="mt-6 text-xs text-muted">
      <div className="font-bold tracking-wide mb-1">SOURCES ON THIS PAGE</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => <a key={s.label} href={s.href} className="px-2.5 py-1 rounded-full bg-soft font-semibold text-fg">{s.label}</a>)}
        <Link href="/sources" className="px-2.5 py-1 rounded-full font-semibold text-accent">All sources ›</Link>
      </div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) { return <div className="card text-muted text-sm">{children}</div>; }
