"use client";
import { useMemo, useState } from "react";
import type { ContactCard } from "@/lib/data-registers";
import { groupLetter, matches, sortKey } from "@/lib/contact-search";
import ContactForm from "@/components/c/ContactForm";

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

export default function ContactsBook({ cards }: { cards: ContactCard[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);   // card id being edited, or "new"
  const [msg, setMsg] = useState<string | null>(null);
  const done = (saved: boolean, message?: string) => { setEditing(null); if (saved && message) { setMsg(message); setTimeout(() => setMsg(null), 6000); } };
  const groups = useMemo(() => {
    const rows = cards.filter((c) => matches(c, q)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.fullName.localeCompare(b.fullName));
    const m = new Map<string, ContactCard[]>();
    for (const r of rows) { const g = groupLetter(r); m.set(g, [...(m.get(g) ?? []), r]); }
    return [...m.entries()].sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  }, [cards, q]);
  const total = groups.reduce((n, [, r]) => n + r.length, 0);
  return (
    <div>
      <div className="flex gap-2 mb-3 sticky top-0 z-10 bg-bg">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search contacts" autoComplete="off" className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-bg text-sm" />
        <button onClick={() => { setEditing("new"); setMsg(null); }} className="min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold whitespace-nowrap">+ Add</button>
      </div>
      {msg && <div role="status" className="rounded-xl bg-green-bg text-green px-3 py-2 text-sm font-semibold mb-3">{msg}</div>}
      {editing === "new" && <div className="rounded-xl border border-line mb-3 bg-bg"><ContactForm onDone={done} /></div>}
      {total === 0 && <div className="text-muted text-sm">No results{q ? ` for “${q}”` : ""}.</div>}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          {groups.map(([letter, rows]) => (
            <section key={letter} id={`g-${letter}`} className="mb-2">
              <div className="text-xs font-bold text-muted px-1 py-1 sticky top-12 bg-bg">{letter}</div>
              <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                {rows.map((c) => {
                  const isOpen = open === c.id;
                  return (
                    <div key={c.id} className="bg-bg">
                      <button onClick={() => setOpen(isOpen ? null : c.id)} className="w-full text-left px-3 py-2.5 min-h-11" aria-expanded={isOpen}>
                        <span className="font-semibold">{c.firstName || (c.lastName ? "" : c.fullName)} </span>
                        <span className="font-bold">{c.lastName}</span>
                        {c.org && (c.firstName || c.lastName) && <span className="block text-xs text-muted">{c.org}</span>}
                      </button>
                      {isOpen && editing === c.id && <ContactForm card={c} onDone={done} />}
                      {isOpen && editing !== c.id && (
                        <div className="px-3 pb-3 flex flex-col gap-2 text-sm">
                          {c.pending && <div className="rounded-xl bg-amber-bg text-amber px-3 py-2 text-xs font-semibold">A change is being saved to Apple Contacts…</div>}
                          {c.phones.map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="flex-1 min-w-0"><div className="text-xs text-muted capitalize">{p.label}</div><div>{p.number}</div></div>
                              <a href={tel(p.number)} className="min-h-11 min-w-11 grid place-items-center rounded-xl bg-accent text-white text-xs font-semibold px-3" aria-label={`Call ${c.fullName} ${p.label}`}>Call</a>
                              <a href={`sms:${p.number.replace(/[^\d+]/g, "")}`} className="min-h-11 min-w-11 grid place-items-center rounded-xl bg-soft text-xs font-semibold px-3">Text</a>
                              <a href={`facetime:${p.number.replace(/[^\d+]/g, "")}`} className="min-h-11 min-w-11 grid place-items-center rounded-xl bg-soft text-xs font-semibold px-3">FaceTime</a>
                            </div>
                          ))}
                          {c.emails.map((e, i) => (
                            <div key={i} className="flex items-center gap-2"><div className="flex-1 min-w-0"><div className="text-xs text-muted capitalize">{e.label}</div><div className="truncate">{e.address}</div></div><a href={`mailto:${e.address}`} className="min-h-11 grid place-items-center rounded-xl bg-soft text-xs font-semibold px-3">Email</a></div>
                          ))}
                          {c.addresses.map((a, i) => { const line = [a.street, a.city, a.state, a.zip].filter(Boolean).join(", "); return <div key={i}><div className="text-xs text-muted capitalize">{a.label}</div><a href={`https://maps.apple.com/?q=${encodeURIComponent(line)}`} className="underline">{line}</a></div>; })}
                          {c.birthday && <div className="text-xs text-muted">Birthday {c.birthday.replace(/^--/, "")}</div>}
                          {c.notes && <div className="text-xs text-muted whitespace-pre-wrap">{c.notes}</div>}
                          {c.mine && !c.pending && <button onClick={() => { setEditing(c.id); setMsg(null); }} className="min-h-11 rounded-xl bg-soft text-xs font-semibold">Edit</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        {!q && groups.length > 3 && (
          <nav aria-label="Jump to letter" className="sticky top-24 self-start flex flex-col text-[10px] font-bold text-accent leading-4">
            {groups.map(([l]) => <a key={l} href={`#g-${l}`} className="px-1">{l}</a>)}
          </nav>
        )}
      </div>
    </div>
  );
}
