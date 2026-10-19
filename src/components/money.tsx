import Link from "next/link";
import type { ReactNode } from "react";
import { type Transaction, type Proof, type Account, proofState, PROOF_LABEL, money, shortDate, accountLabel } from "@/lib/data-money";
import { ago } from "@/lib/data";

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base">{title}</h2>
        {right && <span className="text-xs text-muted">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export function OpenIn({ label, href = "#" }: { label: string; href?: string }) {
  return <a href={href} className="text-xs font-semibold text-accent">Open in {label}</a>;
}

export function SyncLine({ at, label = "Tiller sheet" }: { at: string; label?: string }) {
  return <span className="text-[11px] text-muted">Synced {ago(at)} from {label} · <button className="font-semibold text-accent">Sync now</button></span>;
}

export function ProofDot({ state }: { state: "green" | "amber" | "red" }) {
  const cls = state === "green" ? "bg-green" : state === "amber" ? "bg-amber" : "bg-red";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} aria-label={`proof ${state}`} />;
}

// One transaction card with its proof slot (F22): green digital + photo, amber one proof, red none.
// The slot asks for exactly what is missing. Nothing here pays or moves money.
export function TxCard({ tx, proofs, accounts, compact = false }: { tx: Transaction; proofs: Proof[]; accounts: Account[]; compact?: boolean }) {
  const p = proofState(tx.id, proofs);
  const acc = accounts.find((a) => a.id === tx.account_id);
  const textCls = p.state === "green" ? "text-green" : p.state === "amber" ? "text-amber" : "text-red";
  return (
    <div className="card flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0 flex items-start gap-2">
          <span className="mt-1.5"><ProofDot state={p.state} /></span>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{tx.merchant}</div>
            <div className="text-xs text-muted">{shortDate(tx.date)} · {accountLabel(acc)} · {tx.category ?? "uncategorised"} · {tx.entity}</div>
            <div className="text-[11px] text-muted">{tx.for_person === "Joint" ? "Joint card" : `${tx.for_person}'s card`} · {tx.captured_by} · <a href="#" className="font-semibold text-accent">Open in Tiller</a></div>
          </div>
        </div>
        <div className="font-semibold text-sm shrink-0">{money(tx.amount)}</div>
      </div>
      {tx.flag && <div className="text-xs text-amber font-semibold">{tx.flag}</div>}
      <div className={`text-xs ${textCls}`}>
        <span className="font-semibold">{p.have.length ? `Proof: ${p.have.map((k) => PROOF_LABEL[k]).join(" + ")}` : "No proof"}</span>
        {p.ask && <span className="text-muted"> · {p.ask.replace(/^No proof\. /, "")}</span>}
      </div>
      {!compact && p.state !== "green" && (
        <div className="flex flex-wrap gap-1.5">
          <Link href={`/money/receipts?for=${tx.id}&do=camera`} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Snap the receipt</Link>
          <Link href={`/money/receipts?for=${tx.id}&do=email`} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Find in email</Link>
          <Link href={`/money/receipts?for=${tx.id}&do=upload`} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Upload</Link>
          <Link href={`/money/receipts?for=${tx.id}&do=explain`} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Explain</Link>
        </div>
      )}
      {tx.status === "transfer" && <div className="text-[11px] text-muted">Transfer between own accounts; never counted as spending.</div>}
    </div>
  );
}

export function Bar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "amber" | "green" | "red" }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  const cls = tone === "amber" ? "bg-amber" : tone === "green" ? "bg-green" : tone === "red" ? "bg-red" : "bg-accent";
  return <div className="h-1.5 rounded-full bg-soft overflow-hidden"><div className={`h-full ${cls}`} style={{ width: `${pct}%` }} /></div>;
}
