"use client";
import { useState } from "react";
import Link from "next/link";
import type { Source } from "@/lib/a-shared";
import { StatusDot } from "@/components/registers";

type Local = { state: Source["status"] | "syncing"; lastSynced: string; note?: string };

export function SourceList({ sources, viewer }: { sources: Source[]; viewer: string }) {
  const [local, setLocal] = useState<Record<string, Local>>({});
  const groups = ["Calendar and schedule", "Email", "Money", "Family, home and system"] as const;

  const sync = (s: Source) => {
    setLocal((l) => ({ ...l, [s.id]: { state: "syncing", lastSynced: "syncing…" } }));
    setTimeout(() => setLocal((l) => ({ ...l, [s.id]: { state: "ok", lastSynced: `synced just now · ${viewer} tapped Sync`, note: s.cadence ? `Nothing new upstream (${s.cadence.toLowerCase()})` : undefined } })), 1200);
  };
  const syncAll = () => sources.filter((s) => s.syncable).forEach(sync);

  return (
    <>
      <div className="flex justify-end mb-2"><button type="button" onClick={syncAll} className="min-h-10 px-3.5 rounded-full bg-soft text-sm font-semibold">Sync everything</button></div>
      {groups.map((g) => {
        const rows = sources.filter((s) => s.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="mb-5">
            <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">{g.toUpperCase()}</div>
            <div className="card !py-0">
              {rows.map((s) => {
                const st = local[s.id]?.state ?? s.status;
                const last = local[s.id]?.lastSynced ?? s.lastSynced;
                const note = local[s.id]?.note ?? s.cadence;
                return (
                  <div key={s.id} className="py-2.5 border-b border-line last:border-b-0">
                    <div className="flex items-start gap-2.5">
                      <span className="pt-1.5"><StatusDot state={st} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{s.name} <span className="text-muted font-normal">· {s.account}</span></div>
                        <div className="text-xs text-muted">{s.reads} · added by {s.addedBy}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5 pl-[22px]">
                      <div className={`text-xs min-w-0 ${st === "syncing" ? "text-accent" : st === "warn" ? "text-amber" : "text-muted"}`}>{s.syncable ? (last.startsWith("synced") || last.startsWith("syncing") ? last : `last synced ${last}`) : last}{note ? ` · ${note}` : ""}</div>
                      <div className="flex gap-1.5 shrink-0">
                        {s.syncable && <button type="button" onClick={() => sync(s)} disabled={st === "syncing"} aria-label={`Sync ${s.name} ${s.account} now`} className="min-h-9 px-3 rounded-xl border border-line text-xs font-semibold disabled:opacity-50">Sync now</button>}
                        {s.href.startsWith("/") ? <Link href={s.href} className="min-h-9 px-3 rounded-xl bg-accent text-white text-xs font-semibold inline-flex items-center">Go</Link> : <a href={s.href} aria-label={`Open ${s.name} ${s.account}`} className="min-h-9 px-3 rounded-xl bg-accent text-white text-xs font-semibold inline-flex items-center">Go</a>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
