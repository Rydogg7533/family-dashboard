"use client";
import { useState } from "react";
import Link from "next/link";
import type { Order, ShopCase } from "@/lib/data-shop";
import { ORDER_LABEL, ORDER_STEPS, STORES, ago } from "@/lib/c-shared";
import { useToast } from "@/components/c/Toast";
import { Who } from "@/components/c/Who";

const btn = "min-h-10 px-3 rounded-lg border border-line text-xs font-semibold hover:bg-soft";

export function OrderCard({ o }: { o: Order }) {
  const [state, setState] = useState<Order["status"]>(o.status);
  const [problem, setProblem] = useState(false);
  const { show, el } = useToast();
  const idx = ORDER_STEPS.indexOf(state === "problem" ? "delivered" : state);
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-[11px] font-bold tracking-wide ${state === "problem" ? "text-red" : state === "delivered" ? "text-amber" : state === "received" ? "text-green" : "text-accent"}`}>{ORDER_LABEL[state].toUpperCase()} · {STORES[o.store].name}</div>
          <div className="font-semibold">{o.items} items · {o.total_note}</div>
          <div className="text-sm text-muted">{o.window}{o.tracking_note ? ` · ${o.tracking_note}` : ""}{o.photo ? " · 📷 photo" : ""}</div>
        </div>
        <div className="text-xs text-muted shrink-0">placed {ago(o.placed_at)}</div>
      </div>
      <div className="flex gap-1" aria-label="Progress">
        {ORDER_STEPS.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? (state === "problem" ? "bg-red" : "bg-green") : "bg-soft"}`} title={ORDER_LABEL[s]} />)}
      </div>
      {state === "delivered" && !problem && (
        <div className="flex gap-2">
          <button className={`${btn} flex-1 min-h-11 bg-accent text-white border-accent`} onClick={() => { setState("received"); show("Received · receipt will match the charge, cadence updated", () => setState("delivered")); }}>Received</button>
          <button className={`${btn} flex-1 min-h-11`} onClick={() => setProblem(true)}>Something missing</button>
        </div>
      )}
      {problem && (
        <div className="card bg-soft flex flex-col gap-2 text-sm">
          <div>What's wrong? The assistant builds the case (order number, item, price, photo, the store's route) and opens the fastest path. You tap the final submit.</div>
          <div className="flex flex-wrap gap-1.5">
            {["Item missing", "Wrong item", "Damaged", "Never arrived"].map((w) => <Link key={w} href="/shop/cases" className={btn} onClick={() => setState("problem")}>{w}</Link>)}
            <button className={`${btn} border-transparent`} onClick={() => setProblem(false)}>Cancel</button>
          </div>
        </div>
      )}
      {state === "problem" && o.problem_case && <Link href="/shop/cases" className="text-sm font-semibold text-accent">Case open · see the case flow ›</Link>}
      <Who by={o.placed_by} forPerson={o.for_person} source={o.source.name} href={o.source.href} />
      <div className="text-xs text-muted -mt-1"><a href="#" className="font-semibold text-accent">Open in {STORES[o.store].name} app</a></div>
      {el}
    </div>
  );
}

const CASE_LABEL: Record<ShopCase["status"], { text: string; cls: string }> = {
  building: { text: "BUILDING THE CASE", cls: "text-amber" }, submitted: { text: "SUBMITTED · WAITING FOR THE STORE", cls: "text-amber" }, store_replied: { text: "STORE REPLIED", cls: "text-accent" },
  refund_promised: { text: "REFUND PROMISED", cls: "text-accent" }, refund_posted: { text: "REFUND POSTED · CONFIRM", cls: "text-amber" }, resolved: { text: "RESOLVED", cls: "text-green" },
};

export function CaseCard({ c }: { c: ShopCase }) {
  const [status, setStatus] = useState(c.status);
  const [nudged, setNudged] = useState(false);
  const { show, el } = useToast();
  const l = CASE_LABEL[status];
  return (
    <div className="card flex flex-col gap-2">
      <div>
        <div className={`text-[11px] font-bold tracking-wide ${l.cls}`}>{l.text} · {STORES[c.store].name}</div>
        <div className="font-semibold">{c.item} · {c.issue.replace("_", " ")} · {c.price_note}</div>
        <div className="text-sm text-muted">Route: {c.route}{c.promised_by ? ` · promised by ${new Date(c.promised_by + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}` : ""}</div>
        <Who by={c.opened_by} forPerson={c.for_person} source={`order ${c.order_id}`} href="/shop/orders" className="mt-0.5" />
      </div>
      <ol className="flex flex-col gap-1 text-sm">
        {c.steps.map((s, i) => (
          <li key={i} className={`flex gap-2 ${s.done ? "" : "text-muted"}`}>
            <span className={`shrink-0 w-5 text-center ${s.done ? "text-green" : ""}`}>{s.done ? "✓" : "○"}</span>
            <span>{s.what} <span className="text-xs text-muted">· {s.by === "you" ? "you" : s.by === "store" ? STORES[c.store].name : "assistant"}{s.at ? ` · ${ago(s.at)}` : ""}</span></span>
          </li>
        ))}
      </ol>
      {status === "refund_promised" && (
        <div className="flex gap-2">
          <button className={`${btn} flex-1 min-h-11 bg-accent text-white border-accent`} onClick={() => { setStatus("refund_posted"); show("Marked: credit seen on the card · confirm to close"); }}>Credit posted</button>
          <button className={`${btn} flex-1 min-h-11`} disabled={nudged} onClick={() => { setNudged(true); show("Nudge prepared · you tap send in the store's chat"); }}>{nudged ? "Nudge prepared" : "Nudge the store"}</button>
        </div>
      )}
      {status === "refund_posted" && (
        <button className={`${btn} min-h-11 bg-accent text-white border-accent`} onClick={() => { setStatus("resolved"); show("Case closed · logged with the order and the charge", () => setStatus("refund_posted")); }}>Confirm resolved</button>
      )}
      <div className="text-xs text-muted">A person taps every final submit and accepts any offer. Phone calls: prepared for the <Link href="/voice" className="font-semibold text-accent">voice agent</Link> with limits. <Link href="/shop/orders" className="font-semibold text-accent">Open the order</Link> · <a href="#" className="font-semibold text-accent">Open in {STORES[c.store].name} support</a></div>
      {el}
    </div>
  );
}
