"use client";
// Cards, grouped under the account each one draws on (D-2026-10-27). Adding a card means first saying what it is
// (debit, credit, wallet) which narrows the accounts it can belong to; a credit card can be the physical or virtual
// twin of one already listed (Apple Card: titanium card and Wallet number differ).
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/data-money";
import { cardKind, cardLabel, type PaymentCard } from "@/lib/payment-cards";
import { savePaymentCard, retirePaymentCard, type PaymentCardInput } from "@/app/money/cards-actions";

const KINDS = [["debit", "Debit card", "a checking or savings account"], ["credit", "Credit card", "a credit account"], ["wallet", "Wallet or payment app", "a payment app"]] as const;
const NETWORKS = ["Visa", "Mastercard", "Amex", "Discover"];
const field = "min-h-10 rounded-lg border border-line bg-bg px-3 text-sm";
const blank = (accountId = ""): PaymentCardInput => ({ account_id: accountId, form: "physical", network: "", last4: "", label: "", holder: "", twin_of: null });

export function CardsManager({ cards, accounts, owners }: { cards: PaymentCard[]; accounts: Account[]; owners: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState<PaymentCardInput | null>(null);
  const [kind, setKind] = useState<"debit" | "credit" | "wallet">("credit");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = accounts.filter((a) => !a.retired_at);
  const liveCards = cards.filter((c) => !c.retired_at);
  const forKind = live.filter((a) => cardKind(a.kind) === kind);
  const twins = form ? liveCards.filter((c) => c.account_id === form.account_id && c.form !== form.form && c.id !== form.id) : [];
  const start = (k: "debit" | "credit" | "wallet", accountId = "") => { setKind(k); setForm(blank(accountId)); setErr(null); };
  const edit = (c: PaymentCard) => { setKind(cardKind(live.find((a) => a.id === c.account_id)?.kind)); setForm({ id: c.id, account_id: c.account_id, form: c.form, network: c.network ?? "", last4: c.last4, label: c.label ?? "", holder: c.holder ?? "", twin_of: c.twin_of }); };
  const save = async () => { if (!form) return; setBusy(true); setErr(null); const x = await savePaymentCard(form); setBusy(false); if (x.ok) { setForm(null); router.refresh(); } else setErr(x.error ?? "Could not save."); };

  return (
    <div className="flex flex-col gap-2">
      {live.map((a) => {
        const mine = liveCards.filter((c) => c.account_id === a.id);
        const k = cardKind(a.kind);
        return (
          <div key={a.id} className="card flex flex-col gap-1.5">
            <div className="text-sm font-semibold">{a.institution} ••{a.last4} <span className="text-xs text-muted font-normal">· {k === "debit" ? "bank account" : k === "credit" ? "credit account" : "payment app"}</span></div>
            {mine.length === 0 && <div className="text-xs text-muted">No card listed. {k === "debit" ? "Add the debit card for this account." : k === "credit" ? "Add the physical card and, if you pay from Apple Wallet or a browser, the virtual one." : "Add the wallet's card number if it has one."}</div>}
            {mine.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{cardLabel(c, accounts)}</div>
                  <div className="text-xs text-muted">{c.form === "virtual" ? "Virtual" : "Physical"}{c.holder ? ` · ${c.holder}` : ""}{c.twin_of ? ` · twin of ••${liveCards.find((t) => t.id === c.twin_of)?.last4 ?? "?"}` : ""}</div>
                </div>
                <button onClick={() => edit(c)} className="min-h-10 px-3 text-sm font-semibold text-accent">Edit</button>
              </div>
            ))}
            {!form && <button onClick={() => start(k, a.id)} className="self-start min-h-9 px-3 rounded-full border border-line text-xs font-semibold text-accent">+ Add a card to this account</button>}
          </div>
        );
      })}
      {live.length === 0 && <div className="card text-sm text-muted">List the accounts first; every card has to belong to one.</div>}
      {!form && live.length > 0 && <button onClick={() => start("credit")} className="min-h-11 rounded-xl border border-line font-semibold text-accent">+ Add a card</button>}
      {form && (
        <div className="card flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted">What is it?</div>
          <div className="flex flex-wrap gap-1.5">{KINDS.map(([k, l]) => <button key={k} onClick={() => { setKind(k); setForm({ ...form, account_id: forKind.some((a) => a.id === form.account_id) ? form.account_id : "", twin_of: null }); }} className={`min-h-9 px-3 rounded-full text-sm font-semibold ${kind === k ? "bg-accent text-white" : "border border-line"}`}>{l}</button>)}</div>
          <div className="text-xs font-semibold text-muted">Draws on {KINDS.find((x) => x[0] === kind)?.[2]}</div>
          {forKind.length === 0
            ? <div className="text-sm text-amber font-semibold">No {kind === "debit" ? "checking or savings" : kind === "credit" ? "credit" : "payment app"} account is listed yet. Add it above first.</div>
            : <div className="flex flex-wrap gap-1.5">{forKind.map((a) => <button key={a.id} onClick={() => setForm({ ...form, account_id: a.id, twin_of: null })} className={`min-h-9 px-3 rounded-full text-sm font-semibold ${form.account_id === a.id ? "bg-accent text-white" : "border border-line"}`}>{a.institution} ••{a.last4}</button>)}</div>}
          <div className="flex gap-2">
            <button onClick={() => setForm({ ...form, form: "physical", twin_of: null })} className={`min-h-9 flex-1 rounded-full text-sm font-semibold ${form.form === "physical" ? "bg-accent text-white" : "border border-line"}`}>Physical card</button>
            <button onClick={() => setForm({ ...form, form: "virtual", twin_of: null })} className={`min-h-9 flex-1 rounded-full text-sm font-semibold ${form.form === "virtual" ? "bg-accent text-white" : "border border-line"}`}>Virtual (Wallet, browser)</button>
          </div>
          <div className="flex gap-2">
            <select className={`${field} flex-1`} value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}><option value="">Network</option>{NETWORKS.map((n) => <option key={n}>{n}</option>)}</select>
            <input className={`${field} w-28`} inputMode="numeric" maxLength={4} placeholder="Last four" value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="flex gap-2">
            <input className={`${field} flex-1`} placeholder={form.form === "virtual" ? "Label, e.g. Apple Wallet" : "Label (optional)"} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <select className={`${field} w-32`} value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })}><option value="">Whose</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
          {twins.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-muted">Same card, other form?</div>
              {twins.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="radio" checked={form.twin_of === t.id} onChange={() => setForm({ ...form, twin_of: t.id })} />This is the {form.form} twin of {cardLabel(t, accounts)}</label>)}
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!form.twin_of} onChange={() => setForm({ ...form, twin_of: null })} />A separate card</label>
            </div>
          )}
          {err && <div className="text-sm text-red font-semibold">{err}</div>}
          <div className="flex gap-2">
            <button disabled={busy || !form.account_id} onClick={save} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">Save</button>
            <button onClick={() => { setForm(null); setErr(null); }} className="min-h-11 px-4 rounded-xl border border-line font-semibold">Cancel</button>
            {form.id && <button onClick={async () => { await retirePaymentCard(form.id!); setForm(null); router.refresh(); }} className="min-h-11 px-4 rounded-xl border border-line text-sm text-muted">Retire</button>}
          </div>
        </div>
      )}
    </div>
  );
}
