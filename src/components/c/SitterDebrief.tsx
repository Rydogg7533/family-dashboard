"use client";
// Today, after a visit: "How did it go with Emma? Anything to remember for next time?" One line into a template (you choose which),
// an optional pay note, and "add to approved sitters" when the sitter was a one-off. Dismiss is fine; nothing is saved without a tap.
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { debriefNight } from "@/app/sitter/actions";
import { fmtWhen, type Night } from "@/lib/sitter-shared";

const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
export function SitterDebrief({ night, kids }: { night: Night; kids: { id: string; name: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState(""); const [target, setTarget] = useState("general"); const [pay, setPay] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const who = night.sitterName ?? "the sitter";
  const go = async (save: boolean) => {
    setBusy(true); setErr(null);
    const r = await debriefNight(night.id, save ? { remember: text, target, payNote: pay } : {});
    setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
    router.refresh();
  };
  return (
    <div className="card mb-4 flex flex-col gap-2">
      <div className="font-semibold">How did it go with {who}?</div>
      <div className="text-xs text-muted">{fmtWhen(night.startsAt)}. Anything to remember for next time goes into a template so it’s there automatically.</div>
      <div className="flex gap-2">
        <input className={inp} placeholder="e.g. Hall light stays on for Lily" value={text} onChange={(e) => setText(e.target.value)} />
        <select className={inp + " w-auto"} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Which template"><option value="general">House</option>{kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
      </div>
      <input className={inp} placeholder="Paid (optional): $60 Venmo" value={pay} onChange={(e) => setPay(e.target.value)} />
      {!night.sitterPersonId && night.sitterName && <Link href={`/settings/sitter?tab=sitters&add=${encodeURIComponent(night.sitterName)}`} className="text-xs font-semibold text-accent">Add {night.sitterName} to approved sitters</Link>}
      {err && <div className="text-xs text-red font-semibold">{err}</div>}
      <div className="flex gap-2">
        <button disabled={busy || (!text.trim() && !pay.trim())} onClick={() => go(true)} className="flex-1 min-h-11 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">Save</button>
        <button disabled={busy} onClick={() => go(false)} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-50">Nothing to add</button>
      </div>
    </div>
  );
}
