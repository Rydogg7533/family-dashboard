"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestUnsubscribe, cancelUnsubscribeRequest } from "@/app/email-subscriptions/actions";
import type { EmailSub } from "@/lib/data-email-subs";
import { CATEGORY_LABEL, CATEGORY_ORDER, frequencyLabel, type EmailSubCategory } from "@/lib/email-sub-format";

const day = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", d.getFullYear() === new Date().getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
};

// Tick the senders you are done with, tap Unsubscribe, confirm once. Nothing is ticked for you.
export function EmailSubscriptionList({ subs: allSubs, quietBefore, ready }: { subs: EmailSub[]; quietBefore: string; ready: boolean }) {
  const [box, setBox] = useState<string>("all");
  const boxes = [...new Set(allSubs.map((s) => s.mailbox))].sort();
  const subs = box === "all" ? allSubs : allSubs.filter((s) => s.mailbox === box);
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
  const groups = CATEGORY_ORDER.map((c) => ({ c, rows: subs.filter((s) => (s.category ?? "unclear") === c) })).filter((g) => g.rows.length > 0);
  const tickedAccount = subs.filter((s) => picked.has(s.id) && s.category === "account");
  const setGroup = (rows: EmailSub[], on: boolean) => { setConfirming(false); setMsg(null); setPicked((p) => { const q = new Set(p); rows.forEach((r) => (on ? q.add(r.id) : q.delete(r.id))); return q; }); };

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
      {boxes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show mailbox">
          {["all", ...boxes].map((b) => <button key={b} onClick={() => setBox(b)} aria-pressed={box === b} className={`min-h-9 px-3 rounded-full border text-xs font-semibold ${box === b ? "border-accent bg-accent text-white" : "border-line"}`}>{b === "all" ? `All mailboxes (${allSubs.length})` : `${b} (${allSubs.filter((s) => s.mailbox === b).length})`}</button>)}
        </div>
      )}
      <div className="card">{bar}</div>
      {confirming && (
        <div role="alertdialog" aria-label="Confirm unsubscribe" className="card flex flex-col gap-2 border border-amber">
          <div className="text-sm font-semibold">Unsubscribe from {n} sender{n === 1 ? "" : "s"}?</div>
          {tickedAccount.length > 0 && <div className="text-xs text-amber font-semibold">{tickedAccount.length === 1 ? "One of these is an account notice" : `${tickedAccount.length} of these are account notices`} ({tickedAccount.slice(0, 3).map((s) => s.sender_name || s.address).join(", ")}{tickedAccount.length > 3 ? ", and more" : ""}). Those are often receipts, security alerts or bills. Make sure you want them gone.</div>}
          <div className="text-xs text-muted">Each sender is asked to stop. Your Mac mini sends the requests, and you can cancel until it starts. Once a sender has been told, it can&apos;t be undone from here.</div>
          <div className="flex gap-2">
            <button className="min-h-11 px-3 rounded-xl border border-accent bg-accent text-white font-semibold text-sm flex-1 disabled:opacity-50" disabled={pending} onClick={send}>Yes, unsubscribe</button>
            <button className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm flex-1" disabled={pending} onClick={() => setConfirming(false)}>Not now</button>
          </div>
        </div>
      )}
      {msg && <div className="text-xs font-semibold text-accent px-1" role="status">{msg}</div>}
      {subs.length === 0 && <div className="card text-sm text-muted">No active mailing lists. New ones appear here as they are found.</div>}
      {groups.map(({ c, rows }) => {
        const all = rows.every((r) => picked.has(r.id));
        return (
          <div key={c} className="card flex flex-col">
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="text-[11px] font-bold tracking-wide text-muted uppercase">{CATEGORY_LABEL[c as EmailSubCategory]} · {rows.length}</div>
              {c !== "account" && <button className="text-xs font-semibold text-accent min-h-8" onClick={() => setGroup(rows, !all)}>{all ? "Untick all" : "Tick all"}</button>}
            </div>
            {rows.map((s) => (
              <label key={s.id} className="flex items-start gap-3 py-3 min-h-12 cursor-pointer border-b border-line last:border-0">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-accent" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Unsubscribe from ${s.sender_name || s.address}`} />
                <span className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm truncate">{s.sender_name || s.address}</span>
                  <span className="text-xs text-muted truncate">{s.address}</span>
                  <span className="text-[11px] font-semibold text-accent truncate">To: {s.mailbox}</span>
                  {s.recent_subjects.slice(0, 3).map((t, i) => <span key={i} className="text-xs truncate">&ldquo;{t}&rdquo;</span>)}
                  <span className="text-xs text-muted">{frequencyLabel(s.message_count, s.first_seen, s.last_seen)} · last {day(s.last_seen)}{(s.last_seen ?? "") < quietBefore ? " · quiet for 3+ months" : ""}{s.method !== "one_click" ? " · may need a tap from you" : ""}</span>
                </span>
              </label>
            ))}
          </div>
        );
      })}
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
