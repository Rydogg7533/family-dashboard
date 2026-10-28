"use client";
// One approved sitter: details from the address book card (name, phone) plus the sitter-only fields kept here.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveSitter, archiveSitter, makeFinishTask, restoreSitter, updateSitter, type SitterFields } from "@/app/settings/sitter/templates-actions";
import { SitterFieldsForm } from "@/components/c/SitterPeople";
import type { SitterPerson } from "@/lib/sitter-shared";

const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
const prim = "min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50";
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Denver" });

export function SitterPersonPage({ s, owner, kids, archived, visits }: { s: SitterPerson; owner: boolean; kids: { id: string; name: string }[]; archived: boolean; visits: { id: string; title: string; startsAt: string; payNote: string | null }[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<SitterFields>({ relationship: s.relationship ?? "", ageBand: s.ageBand ?? "", age: s.age, rateText: s.rateText ?? "", drives: s.drives, childrenOk: s.childrenOk, availabilityText: s.availabilityText ?? "", certifiedText: s.certifiedText ?? "", notes: s.notes ?? "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; note?: string }>, after?: () => void) => { setBusy(true); setErr(null); setMsg(null); const r = await fn(); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } if (r.note) setMsg(r.note); after?.(); router.refresh(); };
  const okNames = s.childrenOk == null ? "all kids" : kids.filter((k) => s.childrenOk!.includes(k.id)).map((k) => k.name).join(", ") || "none picked";
  const rows: [string, string | null][] = [
    ["Phone", s.phone ?? (s.pending ? "on the way (contact syncing)" : "no mobile on the card")],
    ["How you know them", s.relationship], ["Adult or teen", s.ageBand ? (s.ageBand === "teen" ? `Teen${s.age ? `, ${s.age}` : ""}` : "Adult") : null],
    ["Rate", s.rateText], ["Drives", s.drives == null ? null : s.drives ? "Yes" : "No"], ["Good with", s.childrenOk == null && !kids.length ? null : okNames],
    ["Availability", s.availabilityText], ["Guardian", s.guardianName], ["CPR / first aid", s.certifiedText], ["Notes", s.notes],
  ];
  return (
    <div className="flex flex-col gap-3">
      {msg && <div className="rounded-xl bg-green-bg text-green px-4 py-3 text-sm font-semibold">{msg}</div>}
      {err && <div className="rounded-xl bg-red-bg text-red px-4 py-3 text-sm font-semibold">{err}</div>}
      <div className="card flex flex-col gap-1">
        <div className="flex justify-between items-start gap-2">
          <div className="font-semibold text-lg">{s.name}</div>
          <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${archived ? "bg-soft text-muted" : s.approvedAt ? "bg-green-bg text-green" : "bg-amber-bg text-amber"}`}>{archived ? "Retired" : s.approvedAt ? "Approved" : "Suggested"}</span>
        </div>
        {s.suggestedBy && !s.approvedAt && <div className="text-xs text-muted">Suggested by {s.suggestedBy}. An owner can approve below.</div>}
        {s.missing.length > 0 && !archived && <div className="text-xs text-amber">{s.missing.length} detail{s.missing.length === 1 ? "" : "s"} missing: {s.missing.join(", ")}.{!s.finishTaskId && <> <button disabled={busy} onClick={() => run(() => makeFinishTask(s.id))} className="font-semibold text-accent">Make it a task</button></>}</div>}
      </div>
      {!edit ? (
        <div className="card flex flex-col gap-1.5">
          {rows.map(([k, v]) => <div key={k} className="flex gap-3 text-sm"><div className="w-32 shrink-0 text-muted text-xs pt-0.5">{k}</div><div className={`flex-1 whitespace-pre-wrap ${v ? "" : "text-muted"}`}>{v ?? "—"}</div></div>)}
          {!archived && <button onClick={() => setEdit(true)} className={btn + " self-start mt-1"}>Edit details</button>}
        </div>
      ) : (
        <div className="card flex flex-col gap-2">
          <SitterFieldsForm f={f} setF={setF} kids={kids} />
          <div className="flex gap-2 items-center"><button disabled={busy} onClick={() => run(() => updateSitter(s.id, f), () => setEdit(false))} className={prim}>Save</button><button onClick={() => setEdit(false)} className="text-xs font-semibold text-muted min-h-9 px-2">Cancel</button></div>
          <div className="text-xs text-muted">Name and phone are edited in Contacts, not here.</div>
        </div>
      )}
      {visits.length > 0 && (
        <div className="card flex flex-col gap-1">
          <div className="font-semibold text-sm">Visits</div>
          {visits.map((v) => <div key={v.id} className="text-sm flex justify-between"><span>{fmt(v.startsAt)} · {v.title}</span>{v.payNote && <span className="text-xs text-muted">{v.payNote}</span>}</div>)}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {owner && !archived && (s.approvedAt ? <button disabled={busy} onClick={() => run(() => approveSitter(s.id, false))} className={btn}>Un-approve</button> : <button disabled={busy} onClick={() => run(() => approveSitter(s.id, true))} className={prim}>Approve</button>)}
        {!archived ? <button disabled={busy} onClick={() => { if (confirm(`Retire ${s.name} from the sitter list? The contact stays in Contacts.`)) run(() => archiveSitter(s.id)); }} className="min-h-10 px-3 text-xs font-semibold text-muted">Retire</button>
          : <button disabled={busy} onClick={() => run(() => restoreSitter(s.id))} className={btn}>Restore</button>}
      </div>
    </div>
  );
}
