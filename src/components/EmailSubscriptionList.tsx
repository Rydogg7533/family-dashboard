"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestUnsubscribe, cancelUnsubscribeRequest } from "@/app/email-subscriptions/actions";
import type { EmailSub } from "@/lib/data-email-subs";
import { CATEGORY_LABEL, CATEGORY_ORDER, frequencyLabel, type EmailSubCategory } from "@/lib/email-sub-format";

const Spin = () => <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin align-[-3px] mr-2" />;
const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const n = picked.size;
  const toggle = (id: string) => { setConfirming(false); setMsg(null); setPicked((p) => { const q = new Set(p); if (q.has(id)) q.delete(id); else q.add(id); return q; }); };
  const send = () => start(async () => {
    setMsg(null);
    try {
      const r = await withTimeout(requestUnsubscribe([...picked]), 25000);
      if (r.ok) { setMsg(`Requested ${r.count}. Each one shows its result here once your Mac mini has sent it.`); setPicked(new Set()); setConfirming(false); router.refresh(); }
      else { setMsg(r.error); setConfirming(false); }
    } catch { setMsg("That took too long and may not have gone through. Nothing is shown as requested until it is saved; reload the page and try again."); setConfirming(false); }
  });
  const groups = CATEGORY_ORDER.map((c) => ({ c, rows: subs.filter((s) => (s.category ?? "unclear") === c) })).filter((g) => g.rows.length > 0);
  const tickedAccount = subs.filter((s) => picked.has(s.id) && s.category === "account");
  const setGroup = (rows: EmailSub[], on: boolean) => { setConfirming(false); setMsg(null); setPicked((p) => { const q = new Set(p); rows.forEach((r) => (on ? q.add(r.id) : q.delete(r.id))); return q; }); };

  const bar = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold" aria-live="polite">{n === 0 ? "Nothing ticked" : `${n} ticked`}</span>
      <div className="flex gap-2">
        {n > 0 && <button className="min-h-11 px-3 rounded-xl border border-line text-sm font-semibold" onClick={() => { setPicked(new Set()); setConfirming(false); }}>Clear</button>}
        <button className="min-h-11 px-4 rounded-xl border border-accent bg-accent text-white text-sm font-semibold disabled:opacity-40" disabled={n === 0 || pending || !ready} onClick={() => setConfirming(true)}>{pending ? <><Spin />Working…</> : <>Unsubscribe{n > 0 ? ` (${n})` : ""}</>}</button>
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
      <div className="sticky z-30 flex flex-col gap-2 top-[calc(44px+env(safe-area-inset-top))] bg-bg -mx-5 px-5 pt-2 pb-2">
        <div className="card shadow-md">{bar}</div>
      {confirming && (
        <div role="alertdialog" aria-label="Confirm unsubscribe" className="card flex flex-col gap-2 border border-amber max-h-[55vh] overflow-y-auto shadow-lg">
          <div className="text-sm font-semibold">Unsubscribe from {n} sender{n === 1 ? "" : "s"}?</div>
          {tickedAccount.length > 0 && <div className="text-xs text-amber font-semibold">{tickedAccount.length === 1 ? "One of these is an account notice" : `${tickedAccount.length} of these are account notices`} ({tickedAccount.slice(0, 3).map((s) => s.sender_name || s.address).join(", ")}{tickedAccount.length > 3 ? ", and more" : ""}). Those are often receipts, security alerts or bills. Make sure you want them gone.</div>}
          <div className="text-xs text-muted">Each sender is asked to stop. Your Mac mini sends the requests, and you can cancel until it starts. Once a sender has been told, it can&apos;t be undone from here.</div>
          <div className="flex gap-2">
            <button className="min-h-11 px-3 rounded-xl border border-accent bg-accent text-white font-semibold text-sm flex-1 disabled:opacity-50" disabled={pending} onClick={send}>{pending ? <><Spin />Working…</> : "Yes, unsubscribe"}</button>
            <button className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm flex-1" disabled={pending} onClick={() => setConfirming(false)}>Not now</button>
          </div>
        </div>
      )}
      </div>
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
            {rows.map((s) => {
              const open = expanded.has(s.id);
              return (
                <div key={s.id} className="border-b border-line last:border-0">
                  <div className="flex items-center min-h-12">
                    <label className="w-11 h-11 shrink-0 flex items-center justify-center cursor-pointer">
                      <input type="checkbox" className="h-5 w-5 accent-accent" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Unsubscribe from ${s.sender_name || s.address}`} />
                    </label>
                    <button type="button" className="flex-1 min-w-0 min-h-11 flex items-center gap-2 text-left" aria-expanded={open} onClick={() => setExpanded((e) => { const q = new Set(e); if (q.has(s.id)) q.delete(s.id); else q.add(s.id); return q; })}>
                      <span className="font-semibold text-sm truncate flex-1">{s.sender_name || s.address}</span>
                      <span aria-hidden className={`text-muted text-xs transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                    </button>
                  </div>
                  {open && (
                    <div className="flex flex-col pl-11 pb-3 min-w-0">
                      <span className="text-xs text-muted truncate">{s.address}</span>
                      <span className="text-[11px] font-semibold text-accent truncate">To: {s.mailbox}</span>
                      {s.recent_subjects.slice(0, 3).map((t, i) => <span key={i} className="text-xs truncate">&ldquo;{t}&rdquo;</span>)}
                      <span className="text-xs text-muted">{frequencyLabel(s.message_count, s.first_seen, s.last_seen)} · last {day(s.last_seen)}{(s.last_seen ?? "") < quietBefore ? " · quiet for 3+ months" : ""}{s.method !== "one_click" ? " · may need a tap from you" : ""}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
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

// While any request is still waiting for the Mac mini, re-read the page every 10 seconds so a finished one moves to "Unsubscribed" on its own.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
