"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Place } from "@/lib/a-shared";
import { useToast } from "@/components/c/Toast";
import { forgetPlace, mergePlace, placeDetail, renamePlace, type PlaceDetail } from "@/app/places/actions";
import { PlaceMap, mapsLink } from "@/components/c/PlaceMap";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });

// Rename / Merge / Forget for the owner's Places. Rename is tier 1 (saved at once); Merge and Forget ask first,
// because they cannot be undone from here.
export function PlacesList({ places }: { places: Place[] }) {
  const router = useRouter();
  const { show, el } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, PlaceDetail>>({});
  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!detail[id]) { const d = await placeDetail(id).catch(() => ({ ok: false, error: "Could not load this place." }) as PlaceDetail); setDetail((x) => ({ ...x, [id]: d })); }
  };
  const sorted = [...places].sort((a, b) => b.visits - a.visits);
  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (!r.ok) { show(r.error ?? "Could not save"); return; }
    show(done); router.refresh();
  };
  if (!places.length) return <div className="card text-muted text-sm">No places learned yet. They appear as you answer &quot;Questions for you&quot; on the Day page.</div>;
  return (
    <>
      <div className="card !py-1">
        {sorted.map((pl) => (
          <div key={pl.id} className="py-2 border-b border-line last:border-b-0">
            <button type="button" onClick={() => void toggle(pl.id)} aria-expanded={open === pl.id} className="text-left font-semibold text-sm">{pl.name}{pl.meaning && pl.meaning !== pl.name ? <span className="text-muted font-normal"> · {pl.meaning}</span> : null}<span className="text-accent font-semibold text-xs"> {open === pl.id ? "▴" : "▾ map"}</span></button>
            {open === pl.id && (() => { const d = detail[pl.id]; return (
              <div className="flex flex-col gap-2 my-2">
                {!d ? <div className="text-xs text-muted">Loading…</div> : !d.ok ? <div className="text-xs text-red">{d.error}</div> : (<>
                  {d.address && <div className="text-xs">{d.address}</div>}
                  <PlaceMap lat={d.lat} lon={d.lon} radiusM={d.radiusM} points={d.visits.map((v) => ({ lat: v.lat, lon: v.lon, label: when(v.startedAt) }))} />
                  {d.visits.length > 0 && <div className="text-xs">{d.visits.slice(0, 8).map((v, i) => <div key={i} className="flex justify-between border-b border-line last:border-b-0 py-1"><span>{when(v.startedAt)}</span><span className="text-muted">{v.mins} min</span></div>)}</div>}
                  <a href={mapsLink(d.lat, d.lon, d.name)} target="_blank" rel="noreferrer" className="self-start text-xs font-semibold text-accent min-h-11 inline-flex items-center">Open in Maps ›</a>
                </>)}
              </div>); })()}
            <div className="text-xs text-muted">{pl.indoors == null ? "" : pl.indoors ? "Indoors · " : "Outdoors · "}{pl.usualActivity ? `${pl.usualActivity} · ` : ""}{pl.visits} visit{pl.visits === 1 ? "" : "s"}</div>
            <div className="flex justify-between items-center gap-2 mt-0.5">
              <span className="text-xs text-muted truncate">{pl.addedBy}</span>
              <span className="flex gap-3 text-xs font-semibold shrink-0">
                <button className="text-accent" disabled={busy === pl.id} onClick={() => { const n = window.prompt("New name for this place:", pl.name); if (n && n.trim() && n.trim() !== pl.name) run(pl.id, () => renamePlace(pl.id, n), `Renamed to ${n.trim()}`); }}>Rename</button>
                <button className="text-muted" disabled={busy === pl.id || sorted.length < 2} onClick={() => {
                  const others = sorted.filter((o) => o.id !== pl.id);
                  const pick = window.prompt(`Merge "${pl.name}" into which place? Type the number:\n` + others.map((o, i) => `${i + 1}. ${o.name}`).join("\n"));
                  const idx = Number(pick) - 1; const into = others[idx];
                  if (!into) return;
                  if (window.confirm(`Merge "${pl.name}" into "${into.name}"? Its visits move over; this cannot be undone.`)) run(pl.id, () => mergePlace(pl.id, into.id), `Merged into ${into.name}`);
                }}>Merge</button>
                <button className="text-muted" disabled={busy === pl.id} onClick={() => { if (window.confirm(`Forget "${pl.name}"? Its times stay in your day record without a label, and you may be asked about it again.`)) run(pl.id, () => forgetPlace(pl.id), `Forgot ${pl.name}`); }}>Forget</button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {el}
    </>
  );
}
