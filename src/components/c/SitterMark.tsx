"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markEventNight, cancelNight } from "@/app/sitter/actions";
import { fmtWhen, type Night } from "@/lib/sitter-shared";

// On a calendar event: mark it as a sitter night. Leave-by is 30 minutes before the event and back-by 30 minutes after, both changeable.
export function SitterMark({ eventKey, title, place, startIso, endIso, existing }: { eventKey: string; title: string; place: string | null; startIso: string; endIso: string; existing: Night | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sitter, setSitter] = useState("");
  const [lm, setLm] = useState(30); const [bm, setBm] = useState(30);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
  if (existing) {
    return (
      <div className="card mt-3 flex flex-col gap-1.5 border-accent">
        <div className="text-[11px] font-bold tracking-wide text-accent">SITTER NIGHT</div>
        <div className="text-sm">{existing.sitterName ? `${existing.sitterName} · ` : ""}you get a prompt at {fmtWhen(existing.leaveAt)}; back by {fmtWhen(existing.endsAt)}.</div>
        <div className="flex gap-3 text-sm"><Link href={`/sitter/review/${existing.id}`} className="font-semibold text-accent min-h-9 inline-flex items-center">Review the sheet</Link>
          <button disabled={busy} onClick={async () => { setBusy(true); await cancelNight(existing.id); setBusy(false); router.refresh(); }} className="font-semibold text-muted min-h-9">Remove</button></div>
      </div>
    );
  }
  if (!open) return <button onClick={() => setOpen(true)} className="mt-3 min-h-10 px-4 rounded-full border border-line text-sm font-semibold">Mark as a sitter night</button>;
  return (
    <form className="card mt-3 flex flex-col gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); const r = await markEventNight({ eventKey, title, place: place ?? undefined, sitterName: sitter, startIso, endIso, leaveMinutes: lm, backMinutes: bm }); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } setOpen(false); router.refresh(); }}>
      <div className="text-xs font-bold tracking-wide text-muted">SITTER NIGHT</div>
      <input className={inp} placeholder="Sitter’s name (optional)" value={sitter} onChange={(e) => setSitter(e.target.value)} />
      <label className="text-xs text-muted">Prompt me this many minutes before the event<input type="number" min={0} max={240} className={inp} value={lm} onChange={(e) => setLm(Number(e.target.value))} /></label>
      <label className="text-xs text-muted">Back this many minutes after it ends<input type="number" min={0} max={240} className={inp} value={bm} onChange={(e) => setBm(Number(e.target.value))} /></label>
      {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
      <div className="flex gap-2"><button disabled={busy} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button><button type="button" onClick={() => setOpen(false)} className="min-h-11 px-4 rounded-xl border border-line text-sm font-semibold">Cancel</button></div>
    </form>
  );
}
