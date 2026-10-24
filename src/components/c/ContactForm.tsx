"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContactCard } from "@/lib/data-registers";
import { saveContact, deleteContact } from "@/app/contacts/actions";

const LABELS = ["mobile", "home", "work", "main", "other"];
const fix = (l: string) => { const x = (l || "other").toLowerCase(); return x === "cell" ? "mobile" : x; };
const field = "w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-sm";

function LabelSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const opts = LABELS.includes(value) ? LABELS : [...LABELS, value];
  return <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 px-2 rounded-xl border border-line bg-bg text-sm capitalize">{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}

export default function ContactForm({ card, onDone }: { card?: ContactCard; onDone: (saved: boolean, message?: string) => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [first, setFirst] = useState(card?.firstName ?? "");
  const [last, setLast] = useState(card?.lastName ?? "");
  const [org, setOrg] = useState(card?.org ?? "");
  const [phones, setPhones] = useState((card?.phones ?? []).map((p) => ({ label: fix(p.label), number: p.number })));
  const [emails, setEmails] = useState((card?.emails ?? []).map((e) => ({ label: fix(e.label), address: e.address })));
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const remove = () => {
    if (!card) return;
    setErr(null);
    start(async () => {
      try {
        const r = await deleteContact(card.id, card.etag ?? null);
        if (!r.ok) { setErr(r.error); setConfirmDel(false); return; }
        router.refresh();
        onDone(true, "Deleting. It will disappear within a couple of minutes. A copy is saved first.");
      } catch { setErr("That took too long. Check your connection and try again."); setConfirmDel(false); }
    });
  };

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        const r = await Promise.race([
          saveContact({ cardId: card?.id, baseEtag: card?.etag ?? null, firstName: first, lastName: last, org, phones, emails }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 25000)),
        ]);
        if (!r.ok) { setErr(r.error); return; }
        router.refresh();
        onDone(true, "unchanged" in r && r.unchanged ? "No changes." : "Saved. It will be in your contacts within a couple of minutes.");
      } catch { setErr("That took too long. Check your connection and try again."); }
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }} className="px-3 pb-3 pt-2 flex flex-col gap-3 text-sm">
      <div className="font-bold">{card ? "Edit contact" : "New contact"}</div>
      <div className="grid grid-cols-2 gap-2">
        <input className={field} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" aria-label="First name" autoComplete="off" />
        <input className={field} value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" autoComplete="off" />
      </div>
      <input className={field} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Company" aria-label="Company" autoComplete="off" />
      <div className="flex flex-col gap-2">
        {phones.map((p, i) => (
          <div key={i} className="flex gap-2">
            <LabelSelect value={p.label} label="Phone type" onChange={(v) => setPhones(phones.map((x, j) => j === i ? { ...x, label: v } : x))} />
            <input className={field} type="tel" inputMode="tel" value={p.number} onChange={(e) => setPhones(phones.map((x, j) => j === i ? { ...x, number: e.target.value } : x))} placeholder="Phone" aria-label="Phone number" />
            <button type="button" aria-label="Remove phone" onClick={() => setPhones(phones.filter((_, j) => j !== i))} className="min-h-11 min-w-11 rounded-xl bg-soft font-bold">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setPhones([...phones, { label: "mobile", number: "" }])} className="min-h-11 rounded-xl bg-soft text-xs font-semibold">+ Add phone</button>
      </div>
      <div className="flex flex-col gap-2">
        {emails.map((m, i) => (
          <div key={i} className="flex gap-2">
            <LabelSelect value={m.label} label="Email type" onChange={(v) => setEmails(emails.map((x, j) => j === i ? { ...x, label: v } : x))} />
            <input className={field} type="email" inputMode="email" autoCapitalize="none" value={m.address} onChange={(e) => setEmails(emails.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} placeholder="Email" aria-label="Email address" />
            <button type="button" aria-label="Remove email" onClick={() => setEmails(emails.filter((_, j) => j !== i))} className="min-h-11 min-w-11 rounded-xl bg-soft font-bold">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setEmails([...emails, { label: "home", address: "" }])} className="min-h-11 rounded-xl bg-soft text-xs font-semibold">+ Add email</button>
      </div>
      {card && <p className="text-xs text-muted">Addresses, birthday, notes and photo are left exactly as they are in your contacts.</p>}
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold">{err}</div>}
      {card?.provider === "google" && (confirmDel
        ? <div className="rounded-xl border border-line p-3 flex flex-col gap-2">
            <div className="font-semibold">Delete {card.fullName} from Google Contacts?</div>
            <div className="text-xs text-muted">A full copy is saved first. It also leaves your phone’s contacts.</div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={remove} className="flex-1 min-h-11 rounded-xl bg-red text-white font-semibold disabled:opacity-60">{busy ? "Working…" : "Yes, delete"}</button>
              <button type="button" disabled={busy} onClick={() => setConfirmDel(false)} className="min-h-11 px-4 rounded-xl bg-soft font-semibold">Keep</button>
            </div>
          </div>
        : <button type="button" disabled={busy} onClick={() => setConfirmDel(true)} className="min-h-11 rounded-xl bg-red-bg text-red text-xs font-semibold">Delete contact</button>)}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-60">{busy ? "Working…" : "Save"}</button>
        <button type="button" disabled={busy} onClick={() => onDone(false)} className="min-h-11 px-4 rounded-xl bg-soft font-semibold">Cancel</button>
      </div>
    </form>
  );
}
