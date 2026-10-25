"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Candidate } from "@/lib/place-candidates";
import { addPlaceHere, hideCandidate, nameCandidate, skipCandidate } from "@/app/places/actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });
const dur = (m: number) => (m >= 120 ? `${Math.round(m / 60)} h` : `${m} min`);

// Places seen on GPS but not named. A suggestion shows its reason and needs a tap; nothing is named for you.
// Naming records the same answer the Day page does; the Mac mini turns it into a Place within about ten minutes.
export function PlaceCandidates({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ key: string; msg: string } | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [here, setHere] = useState(""); const [hereBusy, setHereBusy] = useState(false); const [hereErr, setHereErr] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(key); setErr(null);
    const r = await fn().catch(() => ({ ok: false, error: "That did not save. Try again." }));
    setBusy(null);
    if (!r.ok) { setErr({ key, msg: r.error ?? "That did not save." }); return; }
    setDone(msg); router.refresh();
  }
  function addHere() {
    setHereErr(null);
    if (!here.trim()) { setHereErr("Type a name first."); return; }
    if (!navigator.geolocation) { setHereErr("This browser cannot share your location."); return; }
    setHereBusy(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const r = await addPlaceHere(here, pos.coords.latitude, pos.coords.longitude).catch(() => ({ ok: false, error: "That did not save." }));
      setHereBusy(false);
      if (!r.ok) { setHereErr(r.error ?? "That did not save."); return; }
      setHere(""); setDone("Added. Later visits will be recognized."); router.refresh();
    }, () => { setHereBusy(false); setHereErr("Location is off for this page. Allow it in your browser settings."); }, { enableHighAccuracy: true, timeout: 15000 });
  }

  return (
    <div className="flex flex-col gap-3">
      {done && <div role="status" className="rounded-xl bg-soft px-3 py-2 text-xs font-semibold">{done} Named places appear below within about ten minutes.</div>}
      {candidates.length === 0
        ? <div className="card text-sm text-muted">Nothing waiting. Stops of 8 minutes or more that are not a place you have named will show up here.</div>
        : candidates.map((c) => {
            const v = text[c.key] ?? "";
            return (
              <div key={c.key} className="card flex flex-col gap-2">
                <div>
                  <div className="font-semibold text-sm break-words">{c.address ?? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`}</div>
                  <div className="text-xs text-muted">{c.visits} visit{c.visits === 1 ? "" : "s"} · {dur(c.minutes)} in all{c.when ? ` · ${c.when}` : ""} · last {day(c.lastAt)}</div>
                </div>
                {c.suggestion && (
                  <div className="rounded-xl border border-dashed border-amber bg-soft px-3 py-2 flex flex-col gap-1.5">
                    <div className="text-xs"><span className="font-bold tracking-wide text-amber">MAYBE </span><span className="font-semibold">{c.suggestion.name}</span></div>
                    <div className="text-xs text-muted">{c.suggestion.reason}</div>
                    <button type="button" disabled={busy === c.key} onClick={() => run(c.key, () => nameCandidate(c.ids, c.suggestion!.name), `Named ${c.suggestion!.name}.`)} className="self-start min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">Yes, call it {c.suggestion.name}</button>
                  </div>
                )}
                <form onSubmit={(e) => { e.preventDefault(); void run(c.key, () => nameCandidate(c.ids, v), `Named ${v.trim()}.`); }} className="flex gap-2">
                  <input value={v} onChange={(e) => setText({ ...text, [c.key]: e.target.value })} placeholder={c.suggestion ? "Or type another name" : "Name this place"} aria-label={`Name for ${c.address ?? "this place"}`} className="flex-1 min-h-11 rounded-xl border border-line bg-bg px-3 text-sm" />
                  <button type="submit" disabled={busy === c.key || !v.trim()} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-40">Save</button>
                </form>
                {err?.key === c.key && <div role="alert" className="text-xs text-red">{err.msg}</div>}
                <div className="flex gap-4">
                  <button type="button" disabled={busy === c.key} onClick={() => run(c.key, () => hideCandidate(c.ids), "Marked private.")} className="min-h-11 text-xs font-semibold text-muted">Private</button>
                  <button type="button" disabled={busy === c.key} onClick={() => run(c.key, () => skipCandidate(c.ids), "Skipped.")} className="min-h-11 text-xs font-semibold text-muted">Skip</button>
                </div>
              </div>
            );
          })}
      <div className="card flex flex-col gap-2">
        <div className="text-sm font-semibold">Add a place you are at now</div>
        <div className="flex gap-2">
          <input value={here} onChange={(e) => setHere(e.target.value)} placeholder="Name, like Dentist" aria-label="Name for this place" className="flex-1 min-h-11 rounded-xl border border-line bg-bg px-3 text-sm" />
          <button type="button" disabled={hereBusy} onClick={addHere} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-40">{hereBusy ? "Locating…" : "Add"}</button>
        </div>
        {hereErr && <div role="alert" className="text-xs text-red">{hereErr}</div>}
        <div className="text-xs text-muted">Uses where this device is right now. Later visits within about 150 m are recognized as this place.</div>
      </div>
    </div>
  );
}
