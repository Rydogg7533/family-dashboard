"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordTriageVerdict } from "@/app/review/actions";
import type { Scope, TriageItem, Verdict } from "@/lib/data-review";

// "Did we get this right?" -- one email-made task, judged in one tap. Three buttons, because the two
// ways triage can be wrong need telling apart: it invented work that was not there (not a task), or it
// read real work and typed it wrong (a reply filed as a decide). Those have different fixes.
//
// Saving happens on the first tap (tier 1), so nothing needs two taps to be recorded. A wrong verdict
// then offers the scope question D98b requires of every answer: this one, or the pattern. The wording
// is about whether the judgement is wrong every time. Since D121, "not a task, every time" also PROPOSES
// a sender rule (when the task carries the sender); it acts only once switched on in the rules section.
const VERDICTS: { v: Verdict; label: string }[] = [
  { v: "right", label: "Right" },
  { v: "not_a_task", label: "Not a task" },
  { v: "wrong_type", label: "Wrong type" },
];

const SAID: Record<Verdict, string> = {
  right: "Marked right",
  not_a_task: "Marked: not a task",
  wrong_type: "Marked: wrong type",
};

export function TriageVerdict({ item }: { item: TriageItem }) {
  const [verdict, setVerdict] = useState<Verdict | null>(item.verdict);
  const [scope, setScope] = useState<Scope>(item.scope ?? "once");
  const [err, setErr] = useState<string | null>(null);
  const [proposed, setProposed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = (v: Verdict, s: Scope) => start(async () => {
    setErr(null);
    const r = await recordTriageVerdict(item.id, v, s);
    if (!r.ok) { setErr(("error" in r && r.error) || "That did not work."); return; }
    setVerdict(v); setScope(v === "right" ? "once" : s);
    setProposed(("proposed" in r && r.proposed) || null);
    router.refresh();
  });

  const btn = (on: boolean) =>
    `min-h-11 px-2 rounded-xl border text-[13px] font-semibold flex-1 whitespace-nowrap disabled:opacity-50 ${
      on ? "border-accent bg-accent text-white" : "border-line"
    }`;
  const chip = (on: boolean) =>
    `min-h-9 px-3 rounded-full border text-[12px] font-semibold whitespace-nowrap disabled:opacity-50 ${
      on ? "border-accent bg-accent text-white" : "border-line text-muted"
    }`;

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex gap-2.5 items-start">
        <Link href={`/tasks/${item.id}`} className="font-semibold text-sm leading-snug min-w-0 flex-1">{item.title}</Link>
        <span className="flex-none text-[11px] font-bold rounded-full px-2 py-0.5 bg-soft text-muted whitespace-nowrap">{item.kind}</span>
      </div>

      <div className="text-[11px] text-muted leading-snug">
        {item.from ? <>From {item.from}</> : <>Sender not kept</>}
        {item.account && <> · {item.account}</>}
        {item.mailDate && <> · mail of {item.mailDate}</>}
        {item.status === "dismissed" && <> · you dropped it</>}
        {item.url ? <> · <a href={item.url} target="_blank" rel="noreferrer" className="underline">Open in mail</a></> : <> · no link kept</>}
      </div>

      <div className="flex gap-2">
        {VERDICTS.map(({ v, label }) => (
          <button key={v} type="button" className={btn(verdict === v)} disabled={pending}
            aria-pressed={verdict === v} onClick={() => save(v, "once")}>{label}</button>
        ))}
      </div>

      {verdict && verdict !== "right" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted">Wrong just this once, or wrong every time?</span>
          <div className="flex gap-2">
            <button type="button" className={chip(scope === "once")} disabled={pending}
              aria-pressed={scope === "once"} onClick={() => save(verdict, "once")}>Just this one</button>
            <button type="button" className={chip(scope === "every_time")} disabled={pending}
              aria-pressed={scope === "every_time"} onClick={() => save(verdict, "every_time")}>Every time</button>
          </div>
        </div>
      )}

      {verdict && !err && (
        <div className="text-[11px] font-semibold text-accent" role="status">
          {SAID[verdict]}{verdict !== "right" && scope === "every_time" ? ", every time" : ""}. Tap another to change it.
          {proposed && <> A rule for {proposed} is waiting above: switch it on to keep that sender out.</>}
          {verdict === "not_a_task" && scope === "every_time" && !proposed && !item.fromAddress && <> (No sender kept on this task, so no rule could be proposed.)</>}
        </div>
      )}
      {err && <div className="text-red text-xs font-semibold">{err}</div>}
    </div>
  );
}
