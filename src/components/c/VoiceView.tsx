"use client";
import { useState } from "react";
import type { VoiceCall } from "@/lib/data-voice";
import { CALL_LABEL, ago } from "@/lib/c-shared";
import { useToast } from "@/components/c/Toast";

const btn = "min-h-11 px-3 rounded-lg border border-line text-sm font-semibold hover:bg-soft";

export function CallCard({ c }: { c: VoiceCall }) {
  const [status, setStatus] = useState(c.status);
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(status === "awaiting_approval" || status === "needs_you");
  const { show, el } = useToast();
  const l = CALL_LABEL[status];
  return (
    <div className="card flex flex-col gap-2">
      <button className="text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className={`text-[11px] font-bold tracking-wide ${l.cls}`}>{l.text} · for {c.on_behalf_of}</div>
        <div className="font-semibold">{c.purpose}</div>
        <div className="text-sm text-muted">{c.who} · {c.number_note} · {ago(c.requested_at)}{c.duration_min ? ` · ${c.duration_min} min` : ""}{c.cost_note ? ` · ${c.cost_note}` : ""}</div>
      </button>

      {open && (
        <div className="bg-soft rounded-xl p-3 text-sm flex flex-col gap-1.5">
          <div className="text-[11px] font-bold tracking-wide text-muted">LIMITS FOR THIS CALL</div>
          <div><b>May state:</b> {c.limits.may_state.join(", ")}. Never a PIN, password or vault item.</div>
          <div><b>Accept:</b> {c.limits.accept}</div>
          <div><b>Max $:</b> {c.limits.max_dollars == null ? "none (no money involved)" : `$${c.limits.max_dollars}`}</div>
          <div><b>If asked for more:</b> {c.limits.if_asked_more}</div>
          <div><b>Recording:</b> {c.recorded ? "on (the agent says so on the call)" : "off"}</div>
        </div>
      )}

      {(c.summary || c.outcome) && open && (
        <div className="text-sm">
          {c.outcome && <div><span className="font-semibold">Outcome:</span> {c.outcome}</div>}
          {c.summary && <div className="text-muted mt-0.5"><span className="font-semibold text-fg">Transcript summary:</span> {c.summary} <a href="#" className="font-semibold text-accent">Full transcript</a></div>}
        </div>
      )}

      {status === "awaiting_approval" && !confirm && (
        <div className="flex gap-2">
          <button className={`${btn} flex-1 bg-accent text-white border-accent`} onClick={() => setConfirm(true)}>Approve this call</button>
          <button className={`${btn} flex-1`} onClick={() => { setStatus("declined"); show("Declined · nothing will be called", () => setStatus("awaiting_approval")); }}>Decline</button>
        </div>
      )}
      {confirm && (
        <div className="card border-accent flex flex-col gap-2 text-sm">
          <div>Approve the call with exactly these limits? The agent will say it is an AI assistant calling for {c.on_behalf_of}. You can also reply Y by text.</div>
          <div className="flex gap-2">
            <button className={`${btn} flex-1 bg-accent text-white border-accent`} onClick={() => { setStatus("approved"); setConfirm(false); show("Approved · the call is queued; you get a one-line summary after"); }}>Yes, call within these limits</button>
            <button className={btn} onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {status === "needs_you" && (
        <div className="flex gap-2">
          <button className={`${btn} flex-1 bg-accent text-white border-accent`} onClick={() => { setStatus("approved"); show("Answered · the agent calls back with your answer"); }}>Answer: Tue 2 pm is OK</button>
          <button className={`${btn} flex-1`} onClick={() => { setStatus("done"); show("Marked: I'll handle it myself"); }}>I'll call myself</button>
        </div>
      )}
      <div className="text-xs text-muted">{c.case_href && <a href={c.case_href} className="font-semibold text-accent">Open the case</a>}{c.case_href && " · "}<a href="#" className="font-semibold text-accent">Open in ElevenLabs</a></div>
      {el}
    </div>
  );
}
