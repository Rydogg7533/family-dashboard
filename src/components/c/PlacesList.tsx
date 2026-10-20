"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Place } from "@/lib/a-shared";
import { useToast } from "@/components/c/Toast";
import { forgetPlace, mergePlace, renamePlace } from "@/app/places/actions";

// Rename / Merge / Forget for the owner's Places. Rename is tier 1 (saved at once); Merge and Forget ask first,
// because they cannot be undone from here.
export function PlacesList({ places }: { places: Place[] }) {
  const router = useRouter();
  const { show, el } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
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
            <div className="font-semibold text-sm">{pl.name}{pl.meaning && pl.meaning !== pl.name ? <span className="text-muted font-normal"> · {pl.meaning}</span> : null}</div>
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
