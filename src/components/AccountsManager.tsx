"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/data-money";
import { saveAccount, retireAccount, type AccountInput } from "@/app/money/actions";

const KINDS = [["credit", "Credit card"], ["checking", "Checking"], ["savings", "Savings"], ["payment_app", "Payment app"], ["business", "Business account"]] as const;
const DELIVERY = [["email_pdf", "Emailed with the PDF attached"], ["email_link", "Emailed, link only"], ["upload", "I download and upload it"]] as const;
// The same rule saveAccount uses to name a new account (and so its statement folder).
const folderFor = (institution: string, last4: string) => (`${institution.trim().slice(0, 40)}-${last4.replace(/\D/g, "").slice(-4)}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "name-and-last-four";
const OTHER = "__other__";
const blank: AccountInput = { kind: "credit", institution: "", last4: "", owner: "Joint", entity: "Personal", statement_arrival_day: null, statement_delivery: "email_pdf" };

export function AccountsManager({ accounts, owners }: { accounts: Account[]; owners: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState<AccountInput | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const entityOptions = ["Personal", "Business"];
  const entityChoice = form && entityOptions.includes(form.entity) ? form.entity : OTHER;   // any other saved entity shows under "Other…" with its name
  const edit = (a: Account) => setForm({ id: a.id, kind: a.kind, institution: a.institution, last4: a.last4, owner: a.owner, entity: a.entity, statement_arrival_day: a.statement_arrival_day ?? null, statement_delivery: a.statement_delivery ?? "email_pdf" });
  const save = async () => { if (!form) return; if (entityChoice === OTHER && !form.entity.trim()) { setErr("Name the entity, or choose Personal or Business."); return; } setBusy(true); setErr(null); const x = await saveAccount(form); setBusy(false); if (x.ok) { setForm(null); setNotice(x.notice ?? null); router.refresh(); } else setErr(x.error ?? "Could not save."); };
  const field = "min-h-10 rounded-lg border border-line bg-bg px-3 text-sm";
  return (
    <div className="flex flex-col gap-2">
      {accounts.filter((a) => !a.retired_at).map((a) => (
        <div key={a.id} className="card flex items-center justify-between gap-2">
          <div className="min-w-0 text-sm">
            <div className="font-semibold">{a.institution} ••{a.last4} <span className="text-xs text-muted font-normal">· {KINDS.find((k) => k[0] === a.kind)?.[1] ?? a.kind} · {a.owner}</span></div>
            <div className="text-xs text-muted">{a.statement_arrival_day ? `Statement around the ${a.statement_arrival_day}th` : "No statement day set"} · {DELIVERY.find((d) => d[0] === (a.statement_delivery ?? "email_pdf"))?.[1]}</div>
          </div>
          <button onClick={() => edit(a)} className="min-h-10 px-3 text-sm font-semibold text-accent">Edit</button>
        </div>
      ))}
      {accounts.filter((a) => !a.retired_at).length === 0 && <div className="card text-sm text-muted">No accounts yet. Add every card and bank account that sends a monthly statement.</div>}
      {notice && <div role="status" className="card text-sm font-semibold text-accent">{notice} <a href="/inbox" className="underline">Open the Inbox ›</a></div>}
      {!form && <button onClick={() => setForm({ ...blank })} className="min-h-11 rounded-xl border border-line font-semibold text-accent">+ Add an account</button>}
      {form && (
        <div className="card flex flex-col gap-2">
          <select aria-label="Account type" className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AccountInput["kind"] })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className={field} placeholder="Name, e.g. Apple Card, Chase Sapphire, Wells Fargo checking" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
          <div className="flex gap-2">
            <input className={`${field} flex-1`} inputMode="numeric" maxLength={4} placeholder="Last four" value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, "") })} />
            <input className={`${field} w-32`} inputMode="numeric" placeholder="Statement day" value={form.statement_arrival_day ?? ""} onChange={(e) => setForm({ ...form, statement_arrival_day: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} />
          </div>
          <div className="flex gap-2">
            <select className={`${field} flex-1`} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}><option>Joint</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
            <select aria-label="Entity" className={`${field} flex-1`} value={entityChoice} onChange={(e) => setForm({ ...form, entity: e.target.value === OTHER ? "" : e.target.value })}>
              {entityOptions.map((o) => <option key={o}>{o}</option>)}<option value={OTHER}>Other…</option>
            </select>
          </div>
          {entityChoice === OTHER && <input className={field} placeholder="Name the entity, e.g. Veil Labs" value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })} />}
          <div className="flex flex-col gap-1">{DELIVERY.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" checked={form.statement_delivery === k} onChange={() => setForm({ ...form, statement_delivery: k })} />{l}</label>)}</div>
          <p className="text-xs text-muted">
            {form.id
              ? <>Statements are filed in the folder <b className="text-fg">{form.id}</b>. The folder was named when this account was added and never changes, even if you rename the account here.</>
              : <>When you save, statements for this account will be filed in a folder named <b className="text-fg">{folderFor(form.institution, form.last4)}</b>. The folder name is set once and never changes, so choose the name you want to keep.</>}
          </p>
          {err && <div className="text-sm text-red font-semibold">{err}</div>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={save} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">Save</button>
            <button onClick={() => { setForm(null); setErr(null); }} className="min-h-11 px-4 rounded-xl border border-line font-semibold">Cancel</button>
            {form.id && <button onClick={async () => { const x = await retireAccount(form.id!); setNotice(x.notice ?? null); setForm(null); router.refresh(); }} className="min-h-11 px-4 rounded-xl border border-line text-sm text-muted">Retire</button>}
          </div>
        </div>
      )}
    </div>
  );
}
