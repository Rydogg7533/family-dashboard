"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVaultPointer, removeVaultPointer, generateVaultChecklist, setVaultOwnerRetired } from "@/app/settings/vault/actions";
import { ownerKey, type VaultPointer, type VaultOwner } from "@/lib/vault";

type Group = { id: string; label: string; blurb: string };
const field = "w-full min-h-11 rounded-xl border border-line bg-bg px-3 text-sm";
const TYPES = [["passport", "Passport"], ["driver_license", "Driver license"], ["ssn", "Social Security number"], ["identity", "Identity"], ["document", "Document"], ["bank_account", "Bank account"], ["secure_note", "Secure note"], ["membership", "Membership"], ["software_license", "Software license"], ["other", "Other"]];

export function VaultList({ rows, me, groups, adults, kids, retired, isOwner }: { rows: VaultPointer[]; me: string; groups: Group[]; adults: VaultOwner[]; kids: VaultOwner[]; retired: string[]; isOwner: boolean }) {
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

  const [onlyTodo, setOnlyTodo] = useState(false);
  const [gen, setGen] = useState<string | null>(null);
  const generate = () => start(async () => {
    const r = await generateVaultChecklist();
    const tail = r.others?.length ? ` ${r.others.join(" and ")}'s own items appear when ${r.others.length === 1 ? "she taps" : "they tap"} Generate on ${r.others.length === 1 ? "her" : "their"} own login.` : "";
    setGen(r.ok ? (r.added ? `Added ${r.added} item${r.added === 1 ? "" : "s"}. ${r.total} on your list.${tail}` : `Nothing new to add: all ${r.total} items you can see are already listed.${tail}`) : (r.error ?? "Could not generate."));
    router.refresh();
  });
  const linked = rows.filter((r) => r.link).length;
  const shownRows = onlyTodo ? rows.filter((r) => !r.link) : rows;

  // One section per vault: you, the other adult, Shared, then each child. A section with nothing in it still
  // shows (unless filtering to to-do) so an empty vault is visible rather than missing.
  const myFirst = [...adults].sort((a, b) => Number(b.id === me) - Number(a.id === me));
  const sections: { key: string; title: string; sub: string }[] = [
    ...myFirst.map((a) => ({ key: `a:${a.id}`, title: a.id === me ? `${a.name} (you)` : a.name, sub: a.id === me ? "Your private vault" : `${a.name}'s private vault` })),
    { key: "shared", title: "Shared", sub: "The vault you and your spouse hold together" },
    ...kids.map((k) => ({ key: `k:${k.id}`, title: k.name, sub: `${k.name}'s vault` })),
  ];
  if (rows.some((r) => ownerKey(r, adults, kids) === "other")) sections.push({ key: "other", title: "Other", sub: "Not matched to a person" });
  const isRetired = (key: string) => retired.includes(key);
  const activeSections = sections.filter((s) => !isRetired(s.key));
  const retiredSections = sections.filter((s) => isRetired(s.key));
  const canRetire = (key: string) => isOwner && /^(a|k):/.test(key) && key !== `a:${me}`;
  const setRetired = (key: string, value: boolean) => start(async () => {
    const r = await setVaultOwnerRetired(key, value);
    if (!r.ok) setMsg(r.error ?? "Could not change that."); else { setMsg(null); router.refresh(); }
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between"><span className="font-semibold">Checklist</span><span className="text-xs text-muted">{linked} of {rows.length} linked</span></div>
        <div className="h-1.5 rounded-full bg-soft overflow-hidden"><div className="h-full bg-accent" style={{ width: `${rows.length ? Math.round((linked / rows.length) * 100) : 0}%` }} /></div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={generate} className="min-h-11 flex-1 rounded-xl border border-line font-semibold text-sm disabled:opacity-50">Generate my checklist</button>
          <button type="button" onClick={() => setOnlyTodo((v) => !v)} className={`min-h-11 px-4 rounded-xl font-semibold text-sm ${onlyTodo ? "bg-accent text-white" : "border border-line"}`}>{onlyTodo ? "Showing to-do" : "Show to-do only"}</button>
        </div>
        {gen && <div className="text-xs text-muted">{gen}</div>}
        <div className="text-[11px] text-muted">Generate makes one item for each person, vehicle and business in the household, from the master list; tap it again after a new baby, car or business and it adds only what is new.</div>
      </div>
      {msg && !editing && <div className="text-xs text-red">{msg}</div>}
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
      {activeSections.map((s) => {
        const all = rows.filter((r) => ownerKey(r, adults, kids) === s.key);
        const list = shownRows.filter((r) => ownerKey(r, adults, kids) === s.key);
        if (onlyTodo && list.length === 0) return null;
        const done = all.filter((r) => r.link).length;
        return (
          <section key={s.key}>
            <div className="flex items-baseline justify-between mb-1"><h2 className="font-semibold text-sm">{s.title}</h2><span className="flex items-center gap-2"><span className="text-[11px] text-muted">{done} of {all.length} linked</span>{canRetire(s.key) && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Retire ${s.title}? Their items are kept, just moved out of the main list. You can restore them any time.`)) setRetired(s.key, true); }} className="text-[11px] text-muted underline disabled:opacity-50">Retire</button>}</span></div>
            <div className="text-[11px] text-muted mb-1">{s.sub}</div>
            <div className="card p-0 overflow-hidden text-sm">
              {list.length === 0 ? <div className="px-3 py-2 text-muted">Nothing yet.</div> : groups.map((g) => {
                const inGroup = list.filter((r) => r.group === g.id);
                if (inGroup.length === 0) return null;
                return (
                  <div key={g.id}>
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</div>
                    {inGroup.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-0">
                        <button type="button" onClick={() => setEditing({ ...r, household: r.person === null })} className="min-w-0 flex-1 text-left">
                          <div className="font-semibold truncate">{r.label}</div>
                          <div className="text-[11px] text-muted truncate">{[r.item_type?.replace(/_/g, " "), r.expires_on ? `renews ${r.expires_on}` : null, r.note].filter(Boolean).join(" · ")}</div>
                        </button>
                        {r.link
                          ? <a href={r.link} target="_blank" rel="noopener" className="shrink-0 min-h-9 px-3 rounded-full bg-accent text-white text-xs font-semibold inline-flex items-center">Open</a>
                          : <span className="shrink-0 text-[11px] text-amber">no link yet</span>}
                        <button type="button" onClick={() => remove(r.id)} aria-label="Remove" className="shrink-0 min-h-9 w-9 rounded-full border border-line text-muted text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                );
              })}
      {retiredSections.length > 0 && (
        <details className="card text-sm">
          <summary className="font-semibold cursor-pointer">Retired ({retiredSections.length})</summary>
          <div className="mt-2 flex flex-col gap-2">
            {retiredSections.map((s) => {
              const n = rows.filter((r) => ownerKey(r, adults, kids) === s.key).length;
              return (
                <div key={s.key} className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <div className="min-w-0"><div className="font-semibold truncate">{s.title}</div><div className="text-[11px] text-muted">{n} item{n === 1 ? "" : "s"} kept, hidden from the list</div></div>
                  {canRetire(s.key) || (isOwner && s.key.startsWith("k:")) ? <button type="button" disabled={busy} onClick={() => setRetired(s.key, false)} className="shrink-0 min-h-9 px-3 rounded-full border border-line text-xs font-semibold disabled:opacity-50">Restore</button> : null}
                </div>
              );
            })}
          </div>
        </details>
      )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
