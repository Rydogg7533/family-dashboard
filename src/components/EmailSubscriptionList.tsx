"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestUnsubscribe, cancelUnsubscribeRequest } from "@/app/email-subscriptions/actions";
import type { EmailSub } from "@/lib/data-email-subs";

const day = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", d.getFullYear() === new Date().getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
};

// Tick the senders you are done with, tap Unsubscribe, confirm once. Nothing is ticked for you.
export function EmailSubscriptionList({ subs, quietBefore, ready }: { subs: EmailSub[]; quietBefore: string; ready: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const n = picked.size;
  const toggle = (id: string) => { setConfirming(false); setMsg(null); setPicked((p) => { const q = new Set(p); if (q.has(id)) q.delete(id); else q.add(id); return q; }); };
  const send = () => start(async () => {
    const r = await requestUnsubscribe([...picked]);
    if (r.ok) { setMsg(`Requested ${r.count}. Each one shows its result here once your Mac mini has sent it.`); setPicked(new Set()); setConfirming(false); router.refresh(); }
    else { setMsg(r.error); setConfirming(false); }
  });
  const firstQuiet = subs.findIndex((s) => (s.last_seen ?? "") < quietBefore);

  const bar = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold" aria-live="polite">{n === 0 ? "Nothing ticked" : `${n} ticked`}</span>
      <div className="flex gap-2">
        {n > 0 && <button className="min-h-11 px-3 rounded-xl border border-line text-sm font-semibold" onClick={() => { setPicked(new Set()); setConfirming(false); }}>Clear</button>}
        <button className="min-h-11 px-4 rounded-xl border border-accent bg-accent text-white text-sm font-semibold disabled:opacity-40" disabled={n === 0 || pending || !ready} onClick={() => setConfirming(true)}>Unsubscribe{n > 0 ? ` (${n})` : ""}</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {!ready && <div role="status" className="card border border-amber text-xs"><span className="font-semibold text-amber">Unsubscribing is not switched on yet.</span> <span className="text-muted">Your Mac mini has not reported in from its unsubscribe agent, so the button stays off. You can still look through the list.</span></div>}
      <div className="card">{bar}</div>
      {confirming && (
        <div role="alertdialog" aria-label="Confirm unsubscribe" className="card flex flex-col gap-2 border border-amber">
          <div className="text-sm font-semibold">Unsubscribe from {n} sender{n === 1 ? "" : "s"}?</div>
          <div className="text-xs text-muted">Each sender is asked to stop. Your Mac mini sends the requests, and you can cancel until it starts. Once a sender has been told, it can&apos;t be undone from here.</div>
          <div className="flex gap-2">
            <button className="min-h-11 px-3 rounded-xl border border-accent bg-accent text-white font-semibold text-sm flex-1 disabled:opacity-50" disabled={pending} onClick={send}>Yes, unsubscribe</button>
            <button className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm flex-1" disabled={pending} onClick={() => setConfirming(false)}>Not now</button>
          </div>
        </div>
      )}
      {msg && <div className="text-xs font-semibold text-accent px-1" role="status">{msg}</div>}
      <div className="card flex flex-col">
        {subs.length === 0 && <div className="text-sm text-muted">No active mailing lists. New ones appear here as they are found.</div>}
        {subs.map((s, i) => (
          <div key={s.id} className="border-b border-line last:border-0">
            {i === firstQuiet && firstQuiet > 0 && <div className="text-[11px] font-bold tracking-wide text-muted pt-3 pb-1">QUIET FOR 3+ MONTHS</div>}
            <label className="flex items-start gap-3 py-3 min-h-12 cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-accent" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Unsubscribe from ${s.sender_name || s.address}`} />
              <span className="flex flex-col min-w-0">
                <span className="font-semibold text-sm truncate">{s.sender_name || s.address}</span>
                <span className="text-xs text-muted truncate">{s.address}</span>
                <span className="text-xs text-muted">{s.message_count} email{s.message_count === 1 ? "" : "s"} · last {day(s.last_seen)}{s.method !== "one_click" ? " · may need a tap from you" : ""}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
      {subs.length > 8 && <div className="card">{bar}</div>}
    </div>
  );
}

export function CancelRequest({ ids }: { ids: string[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = () => start(async () => { const r = await cancelUnsubscribeRequest(ids); if (r.ok) router.refresh(); else setMsg(r.error); });
  return (
    <span className="inline-flex flex-col">
      <button className="text-xs font-semibold text-accent text-left min-h-8 disabled:opacity-50" disabled={pending} onClick={go}>Cancel request</button>
      {msg && <span className="text-[11px] text-amber font-semibold" role="status">{msg}</span>}
    </span>
  );
}
