"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelNight } from "@/app/sitter/actions";
import { fmtWhen, type Night } from "@/lib/sitter-shared";

const LABEL: Record<string, string> = { proposed: "Waiting for your answer", scheduled: "Scheduled", awaiting_review: "Review now", confirmed: "On the tablet" };
export function SitterNightList({ nights }: { nights: Night[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  if (!nights.length) return <div className="card text-sm text-muted mb-3">No sitter nights coming up. Mark a calendar event “Sitter”, or tap Sitter tonight on Today.</div>;
  return (
    <div className="flex flex-col gap-2 mb-3">
      <div className="text-xs font-bold tracking-wide text-muted">UPCOMING SITTER NIGHTS</div>
      {nights.map((n) => (
        <div key={n.id} className="card flex flex-col gap-1">
          <div className="flex justify-between gap-2"><div className="font-semibold text-sm">{n.title}</div><div className="text-xs font-bold text-accent shrink-0">{LABEL[n.status]}</div></div>
          <div className="text-xs text-muted">{n.sitterName ? `${n.sitterName} · ` : ""}leave by {fmtWhen(n.leaveAt)} · back by {fmtWhen(n.endsAt)}</div>
          <div className="flex gap-3 text-xs">
            {n.status !== "proposed" && <Link href={`/sitter/review/${n.id}`} className="font-semibold text-accent min-h-9 inline-flex items-center">Review the sheet</Link>}
            <button disabled={busy} onClick={async () => { setBusy(true); await cancelNight(n.id); setBusy(false); router.refresh(); }} className="font-semibold text-muted min-h-9">Cancel</button>
          </div>
        </div>
      ))}
    </div>
  );
}
