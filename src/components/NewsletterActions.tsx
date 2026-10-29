"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveSenders, requestUnsubscribe } from "@/app/email-subscriptions/actions";

const Spin = () => <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin align-[-3px] mr-2" />;

// Archive and Unsubscribe at the reading level (decisions 2026-10-28 D16, D17, D19). Shown on an open message whose
// sender is on the person's mailing lists. Archive hides the sender in the dashboard only (Gmail untouched, one tap,
// reversible from Mailing lists › Archived). Unsubscribe is one confirm, then the Mac mini agent does it; the sender is
// archived automatically once it confirms (D18). Neither button is ever shown for ordinary mail.
export function NewsletterActions({ sub, ready }: { sub: { id: string; name: string; status: string; archived: boolean; auth_ok: boolean | null; trusted: boolean }; ready: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const archive = (on: boolean) => start(async () => {
    setMsg(null); setConfirming(false);
    const r = await archiveSenders([sub.id], on);
    if (r.ok) { setMsg(on ? "Archived. Hidden from Newsletters here; Gmail is unchanged. Bring it back from Mailing lists › Archived." : "Back in Newsletters."); router.refresh(); }
    else setMsg(r.error);
  });
  const unsubscribe = () => start(async () => {
    setMsg(null);
    const r = await requestUnsubscribe([sub.id]);
    if (r.ok) { setMsg("Requested. Your Mac mini sends it within about 10 minutes; the result shows under Mailing lists."); setConfirming(false); router.refresh(); }
    else { setMsg(r.error); setConfirming(false); }
  });
  const unverified = sub.auth_ok === false && !sub.trusted;
  const canUnsub = sub.status === "active";
  const state = sub.status === "requested" ? "Unsubscribe requested" : sub.status === "done" ? "Unsubscribed" : sub.status === "stopped" ? "Stopped sending" : sub.status === "check" ? "Waiting for you under Check first" : ["needs_tap", "open_link", "failed"].includes(sub.status) ? "Needs you under Mailing lists" : null;
  return (
    <div className="card flex flex-col gap-2 my-3">
      <div className="text-xs text-muted">A mailing list: <span className="font-semibold text-fg">{sub.name}</span>{state ? ` · ${state}` : ""}</div>
      <div className="flex gap-2">
        <button type="button" className="min-h-11 px-3 rounded-xl border border-line text-sm font-semibold flex-1 disabled:opacity-50" disabled={pending} onClick={() => archive(!sub.archived)}>{pending ? <><Spin />Working…</> : sub.archived ? "Bring back" : "Archive"}</button>
        {canUnsub && <button type="button" className="min-h-11 px-3 rounded-xl border border-accent bg-accent text-white text-sm font-semibold flex-1 disabled:opacity-40" disabled={pending || !ready} onClick={() => setConfirming(true)}>Unsubscribe</button>}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="Confirm unsubscribe" className="flex flex-col gap-2 border-t border-line pt-2">
          <div className="text-sm font-semibold">Unsubscribe from {sub.name}?</div>
          {unverified && <div className="text-xs text-amber font-semibold">Gmail could not verify this sender. Nothing will be sent; it will come up under Check first on Mailing lists for you to decide.</div>}
          <div className="text-xs text-muted">The sender is asked to stop and is archived here once it confirms. Gmail itself is not changed.</div>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 px-3 rounded-xl border border-accent bg-accent text-white text-sm font-semibold flex-1 disabled:opacity-50" disabled={pending} onClick={unsubscribe}>{pending ? <><Spin />Working…</> : "Yes, unsubscribe"}</button>
            <button type="button" className="min-h-11 px-3 rounded-xl border border-line text-sm font-semibold flex-1" disabled={pending} onClick={() => setConfirming(false)}>Not now</button>
          </div>
        </div>
      )}
      {!ready && canUnsub && <div className="text-xs text-muted">Unsubscribing is off until your Mac mini&apos;s unsubscribe agent reports in.</div>}
      {msg && <div className="text-xs font-semibold text-accent" role="status">{msg}</div>}
    </div>
  );
}
