"use client";
// Accounts and cards on one list (reports 18f2ee09 and 885785bb): divided by what the account is (credit cards, checking, savings,
// business, payment apps), with each card shown directly under the account it draws on, so a debit card reads
// "Debit card attached to <bank> ••<last four>". An edited account moves to its group by itself because the group comes from its type.
// One component holds both forms so the card form can say which account it belongs to.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/data-money";
import { cardKind, cardLabel, type PaymentCard } from "@/lib/payment-cards";
import { saveAccount, retireAccount, type AccountInput } from "@/app/money/actions";
import { savePaymentCard, retirePaymentCard, type PaymentCardInput } from "@/app/money/cards-actions";

const KINDS = [["credit", "Credit card"], ["checking", "Checking"], ["savings", "Savings"], ["payment_app", "Payment app"], ["business", "Business account"]] as const;
// The list headings, in reading order. Each account sits in exactly one, chosen by its type.
const GROUPS = [["credit", "Credit cards"], ["checking", "Checking"], ["savings", "Savings"], ["business", "Business accounts"], ["payment_app", "Payment apps"]] as const;
const CARD_KINDS = [["debit", "Debit card", "a checking or savings account"], ["credit", "Credit card", "a credit account"], ["wallet", "Wallet or payment app", "a payment app"]] as const;
const DELIVERY = [["email_pdf", "Emailed with the PDF attached"], ["email_link", "Emailed, link only"], ["upload", "I download and upload it"]] as const;
const NETWORKS = ["Visa", "Mastercard", "Amex", "Discover"];
// The same rule saveAccount uses to name a new account (and so its statement folder).
const folderFor = (institution: string, last4: string) => (`${institution.trim().slice(0, 40)}-${last4.replace(/\D/g, "").slice(-4)}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "name-and-last-four";
const OTHER = "__other__";
const field = "min-h-10 rounded-lg border border-line bg-bg px-3 text-sm";
const blankAcc: AccountInput = { kind: "credit", institution: "", last4: "", owner: "Joint", entity: "Personal", statement_arrival_day: null, statement_delivery: "email_pdf" };
const blankCard = (accountId = ""): PaymentCardInput => ({ account_id: accountId, form: "physical", network: "", last4: "", label: "", holder: "", twin_of: null });

export function AccountsAndCards({ accounts, cards, owners }: { accounts: Account[]; cards: PaymentCard[]; owners: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [aForm, setAForm] = useState<AccountInput | null>(null);
  const [aErr, setAErr] = useState<string | null>(null);
  const [aBusy, setABusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cForm, setCForm] = useState<PaymentCardInput | null>(null);
  const [kind, setKind] = useState<"debit" | "credit" | "wallet">("credit");
  const [cErr, setCErr] = useState<string | null>(null);
  const [cBusy, setCBusy] = useState(false);
  const live = accounts.filter((a) => !a.retired_at);
  const liveCards = cards.filter((c) => !c.retired_at);
  const forKind = live.filter((a) => cardKind(a.kind) === kind);
  const twins = cForm ? liveCards.filter((c) => c.account_id === cForm.account_id && c.form !== cForm.form && c.id !== cForm.id) : [];
  const entityOptions = ["Personal", "Business"];
  const entityChoice = aForm && entityOptions.includes(aForm.entity) ? aForm.entity : OTHER;   // any other saved entity shows under "Other…" with its name
  const show = () => setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  const editAcc = (a: Account) => openAcc({ id: a.id, kind: a.kind, institution: a.institution, last4: a.last4, owner: a.owner, entity: a.entity, statement_arrival_day: a.statement_arrival_day ?? null, statement_delivery: a.statement_delivery ?? "email_pdf" });
  const aSave = async () => { if (!aForm) return; if (entityChoice === OTHER && !aForm.entity.trim()) { setAErr("Name the entity, or choose Personal or Business."); return; } setABusy(true); setAErr(null); const x = await saveAccount(aForm); setABusy(false); if (x.ok) { setAForm(null); setNotice(x.notice ?? null); router.refresh(); } else setAErr(x.error ?? "Could not aSave."); };
  const editCard = (c: PaymentCard) => { setKind(cardKind(live.find((a) => a.id === c.account_id)?.kind)); setCForm({ id: c.id, account_id: c.account_id, form: c.form, network: c.network ?? "", last4: c.last4, label: c.label ?? "", holder: c.holder ?? "", twin_of: c.twin_of }); };
  const start = (k: "debit" | "credit" | "wallet", accountId = "") => { setKind(k); setCForm(blankCard(accountId)); setCErr(null); };
  const cSave = async () => { if (!cForm) return; setCBusy(true); setCErr(null); const x = await savePaymentCard(cForm); setCBusy(false); if (x.ok) { setCForm(null); router.refresh(); } else setCErr(x.error ?? "Could not cSave."); };
  const openAcc = (v: AccountInput) => { setCForm(null); setAForm(v); show(); };
  const openCard = (k: "debit" | "credit" | "wallet", accountId: string) => { setAForm(null); start(k, accountId); show(); };

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map(([gk, heading]) => {
        const inGroup = live.filter((a) => a.kind === gk);
        if (inGroup.length === 0) return null;
        return (
          <section key={gk} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted">{heading}</h3>
            {inGroup.map((a) => {
              const mine = liveCards.filter((c) => c.account_id === a.id);
              const ck = cardKind(a.kind);
              return (
                <div key={a.id} className="card flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold">{a.institution} ••{a.last4} <span className="text-xs text-muted font-normal">· {KINDS.find((k) => k[0] === a.kind)?.[1] ?? a.kind} · {a.owner}</span></div>
                      <div className="text-xs text-muted">{a.statement_arrival_day ? `Statement around the ${a.statement_arrival_day}th` : "No statement day set"} · {DELIVERY.find((d) => d[0] === (a.statement_delivery ?? "email_pdf"))?.[1]}</div>
                    </div>
                    <button onClick={() => editAcc(a)} className="min-h-10 px-3 shrink-0 whitespace-nowrap text-sm font-semibold text-accent">Edit</button>
                  </div>
                  {mine.map((c) => (
                    <div key={c.id} className="ml-3 pl-3 border-l-2 border-line flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-semibold">{ck === "debit" ? `Debit card attached to ${a.institution} ••${a.last4}` : cardLabel(c, accounts)}</div>
                        <div className="text-xs text-muted">{ck === "debit" ? `${c.network ? `${c.network} ` : ""}••${c.last4} · ` : ""}{c.form === "virtual" ? "Virtual" : "Physical"}{c.label ? ` · ${c.label}` : ""}{c.holder ? ` · ${c.holder}` : ""}{c.twin_of ? ` · twin of ••${liveCards.find((t) => t.id === c.twin_of)?.last4 ?? "?"}` : ""}</div>
                      </div>
                      <button onClick={() => { editCard(c); setAForm(null); show(); }} className="min-h-10 px-3 shrink-0 whitespace-nowrap text-sm font-semibold text-accent">Edit</button>
                    </div>
                  ))}
                  {!cForm && !aForm && <button onClick={() => openCard(ck, a.id)} className="self-start ml-3 min-h-9 px-3 rounded-full border border-line text-xs font-semibold text-accent">{ck === "debit" ? "+ Add the debit card for this account" : "+ Add a card to this account"}</button>}
                </div>
              );
            })}
          </section>
        );
      })}
      {live.length === 0 && <div className="card text-sm text-muted">No accounts yet. Add every card and bank account that sends a monthly statement.</div>}
      {notice && <div role="status" className="card text-sm font-semibold text-accent">{notice} <a href="/inbox" className="underline">Open the Inbox ›</a></div>}
      {!aForm && !cForm && <button onClick={() => openAcc({ ...blankAcc })} className="min-h-11 rounded-xl border border-line font-semibold text-accent">+ Add an account</button>}
      <div ref={formRef} className="flex flex-col gap-2">
      {aForm && (
        <div className="card flex flex-col gap-2">
          <select aria-label="Account type" className={field} value={aForm.kind} onChange={(e) => setAForm({ ...aForm, kind: e.target.value as AccountInput["kind"] })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className={field} placeholder="Name, e.g. Apple Card, Chase Sapphire, Wells Fargo checking" value={aForm.institution} onChange={(e) => setAForm({ ...aForm, institution: e.target.value })} />
          <div className="flex gap-2">
            <input className={`${field} flex-1`} inputMode="numeric" maxLength={4} placeholder="Last four" value={aForm.last4} onChange={(e) => setAForm({ ...aForm, last4: e.target.value.replace(/\D/g, "") })} />
            <input className={`${field} w-32`} inputMode="numeric" placeholder="Statement day" value={aForm.statement_arrival_day ?? ""} onChange={(e) => setAForm({ ...aForm, statement_arrival_day: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} />
          </div>
          <div className="flex gap-2">
            <select className={`${field} flex-1`} value={aForm.owner} onChange={(e) => setAForm({ ...aForm, owner: e.target.value })}><option>Joint</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
            <select aria-label="Entity" className={`${field} flex-1`} value={entityChoice} onChange={(e) => setAForm({ ...aForm, entity: e.target.value === OTHER ? "" : e.target.value })}>
              {entityOptions.map((o) => <option key={o}>{o}</option>)}<option value={OTHER}>Other…</option>
            </select>
          </div>
          {entityChoice === OTHER && <input className={field} placeholder="Name the entity, e.g. Veil Labs" value={aForm.entity} onChange={(e) => setAForm({ ...aForm, entity: e.target.value })} />}
          <div className="flex flex-col gap-1">{DELIVERY.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" checked={aForm.statement_delivery === k} onChange={() => setAForm({ ...aForm, statement_delivery: k })} />{l}</label>)}</div>
          <p className="text-xs text-muted">
            {aForm.id
              ? <>Statements are filed in the folder <b className="text-fg">{aForm.id}</b>. The folder was named when this account was added and never changes, even if you rename the account here.</>
              : <>When you aSave, statements for this account will be filed in a folder named <b className="text-fg">{folderFor(aForm.institution, aForm.last4)}</b>. The folder name is set once and never changes, so choose the name you want to keep.</>}
          </p>
          {aErr && <div className="text-sm text-red font-semibold">{aErr}</div>}
          <div className="flex gap-2">
            <button disabled={aBusy} onClick={aSave} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">Save</button>
            <button onClick={() => { setAForm(null); setAErr(null); }} className="min-h-11 px-4 rounded-xl border border-line font-semibold">Cancel</button>
            {aForm.id && <button onClick={async () => { const x = await retireAccount(aForm.id!); setNotice(x.notice ?? null); setAForm(null); router.refresh(); }} className="min-h-11 px-4 rounded-xl border border-line text-sm text-muted">Retire</button>}
          </div>
        </div>
      )}
      {cForm && (
        <div className="card flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted">What is it?</div>
          <select aria-label="Card type" className={field} value={kind} onChange={(e) => { const k = e.target.value as (typeof CARD_KINDS)[number][0]; setKind(k); setCForm({ ...cForm, account_id: forKind.some((a) => a.id === cForm.account_id) ? cForm.account_id : "", twin_of: null }); }}>{CARD_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <div className="text-xs font-semibold text-muted">Draws on {CARD_KINDS.find((x) => x[0] === kind)?.[2]}</div>
          {forKind.length === 0
            ? <div className="text-sm text-amber font-semibold">No {kind === "debit" ? "checking or savings" : kind === "credit" ? "credit" : "payment app"} account is listed yet. Add it above first.</div>
            : <select aria-label="Account this card draws on" className={field} value={cForm.account_id} onChange={(e) => setCForm({ ...cForm, account_id: e.target.value, twin_of: null })}><option value="">Choose an account</option>{forKind.map((a) => <option key={a.id} value={a.id}>{a.institution} ••{a.last4}</option>)}</select>}
          <div className="flex gap-2">
            <button onClick={() => setCForm({ ...cForm, form: "physical", twin_of: null })} className={`min-h-9 flex-1 rounded-full text-sm font-semibold ${cForm.form === "physical" ? "bg-accent text-white" : "border border-line"}`}>Physical card</button>
            <button onClick={() => setCForm({ ...cForm, form: "virtual", twin_of: null })} className={`min-h-9 flex-1 rounded-full text-sm font-semibold ${cForm.form === "virtual" ? "bg-accent text-white" : "border border-line"}`}>Virtual (Wallet, browser)</button>
          </div>
          <div className="flex gap-2">
            <select className={`${field} flex-1`} value={cForm.network} onChange={(e) => setCForm({ ...cForm, network: e.target.value })}><option value="">Network</option>{NETWORKS.map((n) => <option key={n}>{n}</option>)}</select>
            <input className={`${field} w-28`} inputMode="numeric" maxLength={4} placeholder="Last four" value={cForm.last4} onChange={(e) => setCForm({ ...cForm, last4: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="flex gap-2">
            <input className={`${field} flex-1`} placeholder={cForm.form === "virtual" ? "Label, e.g. Apple Wallet" : "Label (optional)"} value={cForm.label} onChange={(e) => setCForm({ ...cForm, label: e.target.value })} />
            <select className={`${field} w-32`} value={cForm.holder} onChange={(e) => setCForm({ ...cForm, holder: e.target.value })}><option value="">Whose</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
          {twins.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-muted">Same card, other cForm?</div>
              {twins.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="radio" checked={cForm.twin_of === t.id} onChange={() => setCForm({ ...cForm, twin_of: t.id })} />This is the {cForm.form} twin of {cardLabel(t, accounts)}</label>)}
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!cForm.twin_of} onChange={() => setCForm({ ...cForm, twin_of: null })} />A separate card</label>
            </div>
          )}
          {cErr && <div className="text-sm text-red font-semibold">{cErr}</div>}
          <div className="flex gap-2">
            <button disabled={cBusy || !cForm.account_id} onClick={cSave} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">Save</button>
            <button onClick={() => { setCForm(null); setCErr(null); }} className="min-h-11 px-4 rounded-xl border border-line font-semibold">Cancel</button>
            {cForm.id && <button onClick={async () => { await retirePaymentCard(cForm.id!); setCForm(null); router.refresh(); }} className="min-h-11 px-4 rounded-xl border border-line text-sm text-muted">Retire</button>}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
