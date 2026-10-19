"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Draft, DraftAttachment } from "@/lib/data-email";
import { saveDraft, requestMailDraft } from "@/app/tasks/[id]/actions";

export function DraftEditor({ draft }: { draft: Draft }) {
  const [text, setText] = useState(draft.text);
  const [atts, setAtts] = useState<DraftAttachment[]>(draft.attachments);
  const [anyway, setAnyway] = useState(draft.create_anyway);
  const [askAnyway, setAskAnyway] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "requested">(draft.mail_draft_ref ? "requested" : "idle");
  const [attachFor, setAttachFor] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const missing = atts.filter((a) => a.status === "missing");
  const complete = anyway || missing.length === 0;
  const dirty = text !== draft.text || atts !== draft.attachments || anyway !== draft.create_anyway;

  async function save(a = anyway) {
    setState("saving");
    await saveDraft(draft.id, text, atts, a);
    setState("saved");
  }
  function attached(i: number, name: string) {
    setAtts((as) => as.map((a, j) => (j === i ? { ...a, status: "attached", path: `From my phone: ${name}` } : a)));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base">Reply draft</h2>
        <span className={`text-xs font-bold ${complete ? "text-green" : "text-amber"}`}>{complete ? "Ready to send" : "Not ready to send"}</span>
      </div>

      <div className="card flex flex-col gap-2">
        <div className="text-xs text-muted">For {draft.requested_by} · To {draft.to} · from {draft.account}</div>
        <div className="text-sm font-semibold">{draft.subject}</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className="w-full rounded-xl border border-line bg-bg p-3 text-sm leading-relaxed" aria-label="Draft text" />
        <div className="text-[11px] text-muted">Edit here. Drafted by the assistant in your voice; one more model call if you ask for a change.</div>
      </div>

      <div className="card flex flex-col gap-2">
        <div className="font-semibold text-sm">Attachments the reply needs</div>
        {atts.map((a, i) => (
          <div key={a.name} className="flex flex-col gap-1 py-1 border-b border-line last:border-0">
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${a.status === "attached" ? "bg-green" : "bg-amber"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{a.name}</div>
                {a.status === "attached" ? (
                  <div className="text-xs text-muted">Attached · {a.path}</div>
                ) : (
                  <>
                    <div className="text-xs text-amber font-semibold">Missing</div>
                    <div className="text-xs text-muted">Looked in: {a.looked_in.join("; ")}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <a href="#" className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Find it for me</a>
                      <button onClick={() => { setAttachFor(i); fileRef.current?.click(); }} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold">+ Attach</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f && attachFor !== null) attached(attachFor, f.name); setAttachFor(null); }} />
        {!complete && <div className="text-xs text-muted">No mail draft exists until the attachments are complete, so it cannot be sent by mistake. &ldquo;Find it for me&rdquo; opens the Documents finder; &ldquo;+ Attach&rdquo; takes a file from this device.</div>}
        {anyway && <div className="text-xs text-amber font-semibold">You chose &ldquo;Create anyway&rdquo;; this is logged. Attach the missing item in the mail app before sending.</div>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button onClick={() => save()} disabled={state === "saving" || !dirty} className="min-h-11 flex-1 rounded-xl border border-line font-semibold text-sm disabled:opacity-50">{state === "saving" ? "Saving…" : state === "saved" && !dirty ? "Saved" : "Save draft"}</button>
          <button onClick={async () => { await save(); await requestMailDraft(draft.id); setState("requested"); }} disabled={!complete || state === "requested"} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-40">
            {state === "requested" ? "Mail draft created" : "Send to Mail as draft"}
          </button>
        </div>
        {state === "requested" && <div className="text-xs text-green font-semibold">The draft is in your mail app. Open it there for the final send; nothing is sent from here.</div>}
        {!complete && !askAnyway && <button onClick={() => setAskAnyway(true)} className="text-xs text-muted underline self-start min-h-8">Create anyway, I&apos;ll attach it myself</button>}
        {askAnyway && !complete && (
          <div className="card border-amber flex flex-col gap-2">
            <div className="text-sm">Create the mail draft without {missing.length === 1 ? `"${missing[0].name}"` : `${missing.length} attachments`}? This is logged, and the draft will say what is missing.</div>
            <div className="flex gap-2">
              <button onClick={async () => { setAnyway(true); setAskAnyway(false); await save(true); }} className="min-h-11 flex-1 rounded-xl bg-amber-bg text-amber border border-amber font-semibold text-sm">Yes, create anyway</button>
              <button onClick={() => setAskAnyway(false)} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">No</button>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-muted">Origin: <a href={draft.origin_href} className="font-semibold text-accent">Open in Gmail</a> · <Link href="/tasks" className="font-semibold text-accent">Back to Tasks</Link></div>
    </section>
  );
}
