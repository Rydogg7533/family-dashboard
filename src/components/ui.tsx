import type { ReactNode } from "react";

export function Banner({ level, text }: { level: "ok" | "warn" | "error"; text: string }) {
  const cls = level === "ok" ? "bg-green-bg text-green" : level === "warn" ? "bg-amber-bg text-amber" : "bg-red-bg text-red";
  return <div className={`rounded-xl px-4 py-3 font-semibold ${cls}`}>{text}</div>;
}

export function Chip({ status }: { status: string }) {
  const map: Record<string, string> = {
    DONE: "bg-green-bg text-green", RUNNING: "bg-amber-bg text-amber", TODO: "bg-soft text-fg", WAIT: "bg-soft text-muted", OUT: "bg-soft text-muted line-through",
    ok: "bg-green-bg text-green", warn: "bg-amber-bg text-amber", error: "bg-red-bg text-red", unknown: "bg-soft text-muted",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${map[status] ?? "bg-soft"}`}>{status}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function H1({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h1 className="text-2xl">{children}</h1>
      {right && <div className="text-xs text-muted">{right}</div>}
    </div>
  );
}
