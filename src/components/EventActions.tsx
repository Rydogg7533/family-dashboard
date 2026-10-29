"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeEvent } from "@/app/calendar/actions";

// Edit and Delete on the event page itself (issue 4a59492f, 2026-10-28). Delete confirms in the page, never with the
// browser's own dialog: on the installed iPhone app that dialog is unreliable (it appeared, and the event stayed).
// Google's answer is shown in words when it refuses (a calendar you cannot write to, an event already gone).
export function EventActions({ calendarId, id, title, repeats }: { calendarId: string; id: string; title: string; repeats: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const del = async () => {
    setBusy(true); setErr(null);
    const r = await removeEvent(calendarId, id, title);
    setBusy(false);
    if (r.ok) router.push("/calendar?deleted=1");
    else setErr(/403|forbidden|writer/i.test(r.error ?? "") ? "Google refused: you cannot change this calendar. Delete it in Google Calendar, or ask its owner." : /404|not found|deleted/i.test(r.error ?? "") ? "Google says this event is already gone. Pull to refresh." : `Google did not delete it: ${r.error ?? "unknown error"}`);
  };
  return (
    <div className="mt-4 flex flex-col gap-2">
      {!confirming ? (
        <div className="flex gap-2">
          <Link href="?edit=1" className="flex-1 min-h-11 rounded-xl border border-line font-semibold text-sm grid place-items-center">Edit</Link>
          <button type="button" className="flex-1 min-h-11 rounded-xl border border-line font-semibold text-sm text-red" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      ) : (
        <div role="alertdialog" aria-label="Confirm delete" className="card border border-red flex flex-col gap-2">
          <div className="text-sm font-semibold">Delete &ldquo;{title}&rdquo; from Google Calendar?</div>
          <div className="text-xs text-muted">{repeats ? "This removes this one occurrence; the series stays." : "Guests, if any, are told by Google."} It disappears from every phone that shows this calendar.</div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={del} className="flex-1 min-h-11 rounded-xl bg-red text-white font-semibold text-sm disabled:opacity-50">{busy ? "Deleting…" : "Yes, delete"}</button>
            <button type="button" disabled={busy} onClick={() => { setConfirming(false); setErr(null); }} className="flex-1 min-h-11 rounded-xl border border-line font-semibold text-sm">Keep it</button>
          </div>
        </div>
      )}
      {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
    </div>
  );
}
