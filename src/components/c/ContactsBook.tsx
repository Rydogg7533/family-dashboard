"use client";
import { useMemo, useState } from "react";
import type { ContactCard } from "@/lib/data-registers";
import { groupLetter, matches, sortKey } from "@/lib/contact-search";

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

export default function ContactsBook({ cards }: { cards: ContactCard[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const rows = cards.filter((c) => matches(c, q)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.fullName.localeCompare(b.fullName));
    const m = new Map<string, ContactCard[]>();
    for (const r of rows) { const g = groupLetter(r); m.set(g, [...(m.get(g) ?? []), r]); }
    return [...m.entries()].sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  }, [cards, q]);
  const total = groups.reduce((n, [, r]) => n + r.length, 0);
  return (
    <div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search contacts" autoComplete="off" className="w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-sm mb-3 sticky top-0 z-10" />
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
                      {isOpen && (
                        <div className="px-3 pb-3 flex flex-col gap-2 text-sm">
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
