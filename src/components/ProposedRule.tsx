"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEmailRule } from "@/app/review/actions";
import type { ProposedRule as Rule } from "@/lib/data-review";

// One sender rule waiting for a tap. Activate is what makes triage read it (D121); Not now keeps it
// as history. The card says exactly what will happen and shows the evidence it was proposed from
// (D118: no evidence, no question). Owners only; a member sees the card without buttons.
const WHAT: Record<string, string> = {
  ignore: "never becomes a task; mail stays where it is",
  archive: "never becomes a task; filed as handled",
  money: "treated as a receipt (Money pipeline)",
  record: "kept for records, no task",
  task: "always a task",
};

export function ProposedRule({ rule, owner }: { rule: Rule; owner: boolean }) {
  const [done, setDone] = useState<"approved" | "off" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const act = (status: "approved" | "off") => start(async () => {
    setErr(null);
    const r = await setEmailRule(rule.id, status);
    if (!r.ok) { setErr(("error" in r && r.error) || "That did not work."); return; }
    setDone(status); router.refresh();
  });

  const btn = (primary: boolean) =>
    `min-h-11 px-3 rounded-xl border text-[13px] font-semibold flex-1 whitespace-nowrap disabled:opacity-50 ${primary ? "border-accent bg-accent text-white" : "border-line"}`;

  return (
    <div className="card flex flex-col gap-2">
      <div className="font-semibold text-sm leading-snug">
        Mail from <span className="font-mono text-[13px]">{rule.match_value}</span>{rule.match_kind === "domain" ? " (any sender there)" : ""}
        {rule.mailbox ? <span className="text-muted font-normal"> · {rule.mailbox} only</span> : null}
      </div>
      <div className="text-[12px] leading-snug">{WHAT[rule.action] ?? rule.action}.</div>
      <div className="text-[11px] text-muted leading-snug">
        {rule.note ?? "No note."}{rule.origin ? <> · from {rule.origin}</> : null}
      </div>
      {owner && !done && (
        <div className="flex gap-2">
          <button type="button" className={btn(true)} disabled={pending} onClick={() => act("approved")}>Switch on</button>
          <button type="button" className={btn(false)} disabled={pending} onClick={() => act("off")}>Not now</button>
        </div>
      )}
      {done && <div className="text-[11px] font-semibold text-accent" role="status">{done === "approved" ? "On. Applies from the next mail check." : "Declined; kept as history."}</div>}
      {err && <div className="text-red text-xs font-semibold">{err}</div>}
    </div>
  );
}
