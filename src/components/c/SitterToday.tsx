"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { answerProposal, createToldNight } from "@/app/sitter/actions";
import { fmtWhen, type Night } from "@/lib/sitter-shared";

const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
const hhmm = (d: Date, tz: string, add = 0) => new Date(d.getTime() + add).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
const today = (tz: string) => new Date().toLocaleDateString("en-CA", { timeZone: tz });

// Today: (1) a night that needs review right now, (2) a question about an evening event, (3) the "Sitter tonight" button for telling the app directly.
export function SitterToday({ review, proposal, tz, upcoming = [], sitters = [] }: { review: Night | null; proposal: Night | null; tz: string; upcoming?: Night[]; sitters?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sitter, setSitter] = useState(""); const [pick, setPick] = useState<string>(""); const [place, setPlace] = useState("");
  const [date, setDate] = useState(""); const [leave, setLeave] = useState(""); const [back, setBack] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {review && (
        <Link href={`/sitter/review/${review.id}`} className="block mb-4">
          <div className="card border-accent"><div className="font-semibold">Time to go: check the sitter sheet</div><div className="text-xs text-muted mt-1">{review.title} · confirm what the kitchen tablet will show. <span className="text-accent font-semibold">Open</span></div></div>
        </Link>
      )}
      {proposal && (
        <div className="card mb-4 border-accent flex flex-col gap-2">
          <div className="font-semibold">Is a sitter coming?</div>
          <div className="text-xs text-muted">{proposal.title} · {fmtWhen(proposal.startsAt)}{proposal.place ? ` · ${proposal.place}` : ""}. It looks like an event without the kids.</div>
          <input className={inp} placeholder="Sitter’s name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          {err && <div role="alert" className="text-xs text-red font-semibold">{err}</div>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await answerProposal(proposal.id, true, name); setBusy(false); if (!r.ok) { setErr(r.error ?? "Try again."); return; } if (r.review) router.push(`/sitter/review/${proposal.id}`); else router.refresh(); }} className="flex-1 min-h-11 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">Yes, a sitter is coming</button>
            <button disabled={busy} onClick={async () => { setBusy(true); const r = await answerProposal(proposal.id, false); setBusy(false); if (!r.ok) setErr(r.error ?? "Try again."); else router.refresh(); }} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-50">No</button>
          </div>
        </div>
      )}
      {upcoming.filter((n) => n.id !== review?.id).map((n) => (
        <Link key={n.id} href={`/sitter/review/${n.id}`} className="block mb-2">
          <div className="card text-sm flex justify-between items-center gap-2">
            <div><div className="font-semibold">{n.status === "needed" ? `Still need a sitter ${fmtWhen(n.startsAt)}` : `${n.sitterName ? `${n.sitterName} sits` : "Sitter"} ${fmtWhen(n.startsAt)}`}</div><div className="text-xs text-muted">{n.status === "needed" ? "Get the sheet ready, or say who’s booked" : n.status === "confirmed" ? "On the tablet" : n.preparedAt ? "Instructions chosen · confirm when you leave" : "Usual instructions ready · tap to look"}</div></div>
            <span className="text-accent font-semibold text-xs shrink-0">Open</span>
          </div>
        </Link>
      ))}
      <div className="mb-4 mt-2">
        {!open ? <button onClick={() => { setDate(today(tz)); setLeave(hhmm(new Date(), tz, 30 * 60e3)); setBack(hhmm(new Date(), tz, 4 * 3600e3)); setOpen(true); }} className="min-h-10 px-4 rounded-full border border-line text-sm font-semibold">Sitter tonight</button> : (
          <form className="card flex flex-col gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); const picked = sitters.find((s) => s.id === pick); const r = await createToldNight({ title: "", place, sitterName: picked ? picked.name : pick === "none" ? "" : sitter, sitterPersonId: picked?.id ?? null, needed: pick === "none", date, leaveTime: leave, backTime: back }); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } setOpen(false); if (r.id) router.push(`/sitter/review/${r.id}`); else router.refresh(); }}>
            <div className="text-xs font-bold tracking-wide text-muted">TELL ME ABOUT A SITTER NIGHT</div>
            {sitters.length > 0 && <select className={inp} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Who’s sitting?</option>{sitters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="new">Someone else</option><option value="none">Still looking</option></select>}
            {(pick === "new" || !sitters.length) && <input className={inp} placeholder={sitters.length ? "Their name" : "Sitter’s name (optional)"} value={sitter} onChange={(e) => setSitter(e.target.value)} />}
            <input className={inp} placeholder="Where you’ll be (optional)" value={place} onChange={(e) => setPlace(e.target.value)} />
            <label className="text-xs text-muted">Day<input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">You leave at<input type="time" className={inp} value={leave} onChange={(e) => setLeave(e.target.value)} /></label>
              <label className="text-xs text-muted">Back by<input type="time" className={inp} value={back} onChange={(e) => setBack(e.target.value)} /></label>
            </div>
            <div className="text-[11px] text-muted">Next you’ll see the sheet with the usual instructions already in; one tap confirms it. A reminder comes the day before and again at leave time.</div>
            {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
            <div className="flex gap-2"><button disabled={busy} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button><button type="button" onClick={() => setOpen(false)} className="min-h-11 px-4 rounded-xl border border-line text-sm font-semibold">Cancel</button></div>
          </form>
        )}
      </div>
    </>
  );
}
