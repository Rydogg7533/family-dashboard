"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVaultPointer, removeVaultPointer } from "@/app/settings/vault/actions";
import type { VaultPointer } from "@/lib/vault";

type Group = { id: string; label: string; blurb: string };
const field = "w-full min-h-11 rounded-xl border border-line bg-bg px-3 text-sm";
const TYPES = [["passport", "Passport"], ["driver_license", "Driver license"], ["ssn", "Social Security number"], ["identity", "Identity"], ["document", "Document"], ["bank_account", "Bank account"], ["secure_note", "Secure note"], ["membership", "Membership"], ["software_license", "Software license"], ["other", "Other"]];

export function VaultList({ rows, me, groups }: { rows: VaultPointer[]; me: string; groups: Group[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<VaultPointer> & { household?: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = () => {
    if (!editing) return;
    start(async () => {
      const r = await saveVaultPointer({ id: editing.id, group: editing.group ?? "other", label: editing.label ?? "", item_type: editing.item_type ?? "", link: editing.link ?? "", expires_on: editing.expires_on ?? "", note: editing.note ?? "", household: !!editing.household });
      if (!r.ok) { setMsg(r.error ?? "Could not save."); return; }
      setEditing(null); setMsg(null); router.refresh();
    });
  };
  const remove = (id: string) => start(async () => { const r = await removeVaultPointer(id); if (!r.ok) setMsg(r.error ?? "Could not remove."); else router.refresh(); });

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setEditing({ group: "identity", household: false })} className="min-h-11 rounded-xl bg-accent text-white font-semibold text-sm">Add a pointer</button>
      {editing && (
        <div className="card flex flex-col gap-2 text-sm">
          <div className="font-semibold">{editing.id ? "Edit pointer" : "New pointer"}</div>
          <label className="text-xs text-muted">Name, as it is named in 1Password<input className={field} value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Ryan passport" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Group<select className={field} value={editing.group ?? "other"} onChange={(e) => setEditing({ ...editing, group: e.target.value as VaultPointer["group"] })}>{groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
            <label className="text-xs text-muted">1Password type<select className={field} value={editing.item_type ?? ""} onChange={(e) => setEditing({ ...editing, item_type: e.target.value })}><option value="">—</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <label className="text-xs text-muted">Private link (1Password › item › ⋯ › Copy Private Link)<input className={field} value={editing.link ?? ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} placeholder="https://start.1password.com/open/i?…" inputMode="url" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Expires or renews<input type="date" className={field} value={editing.expires_on ?? ""} onChange={(e) => setEditing({ ...editing, expires_on: e.target.value })} /></label>
            <label className="text-xs text-muted flex items-end gap-2 pb-3"><input type="checkbox" checked={!!editing.household} onChange={(e) => setEditing({ ...editing, household: e.target.checked })} /> Household item (Shared vault)</label>
          </div>
          <label className="text-xs text-muted">Note<input className={field} value={editing.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="Original in the fire safe" /></label>
          {msg && <div className="text-xs text-red">{msg}</div>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => { setEditing(null); setMsg(null); }} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Cancel</button>
          </div>
        </div>
      )}
      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g.id);
        return (
          <section key={g.id}>
            <div className="flex items-baseline justify-between mb-1"><h2 className="font-semibold text-sm">{g.label}</h2><span className="text-[11px] text-muted">{list.length}</span></div>
            <div className="text-[11px] text-muted mb-1">{g.blurb}</div>
            <div className="card p-0 overflow-hidden text-sm">
              {list.length === 0 ? <div className="px-3 py-2 text-muted">Nothing yet.</div> : list.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-0">
                  <button type="button" onClick={() => setEditing({ ...r, household: r.person === null })} className="min-w-0 flex-1 text-left">
                    <div className="font-semibold truncate">{r.label}</div>
                    <div className="text-[11px] text-muted truncate">{[r.person === null ? "Household" : r.person === me ? "Yours" : "Theirs", r.item_type?.replace(/_/g, " "), r.expires_on ? `renews ${r.expires_on}` : null, r.note].filter(Boolean).join(" · ")}</div>
                  </button>
                  {r.link
                    ? <a href={r.link} target="_blank" rel="noopener" className="shrink-0 min-h-9 px-3 rounded-full bg-accent text-white text-xs font-semibold inline-flex items-center">Open</a>
                    : <span className="shrink-0 text-[11px] text-amber">no link yet</span>}
                  <button type="button" onClick={() => remove(r.id)} aria-label="Remove" className="shrink-0 min-h-9 w-9 rounded-full border border-line text-muted text-xs">✕</button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
