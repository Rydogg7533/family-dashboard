"use client";
import { useMemo, useRef, useState } from "react";
import type { ContactCard } from "@/lib/data-registers";
import { groupLetter, matches, sortKey } from "@/lib/contact-search";
import ContactForm from "@/components/c/ContactForm";

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;


const ALPHA = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
// Apple-style index: run a finger up and down the letters and the list follows; letters with no contacts jump to the next one.
function IndexRail({ present }: { present: string[] }) {
  const ref = useRef<HTMLElement>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const go = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r || !present.length) return;
    const i = Math.max(0, Math.min(ALPHA.length - 1, Math.floor(((clientY - r.top) / r.height) * ALPHA.length)));
    const hit = ALPHA.slice(i).find((l) => present.includes(l)) ?? [...present].reverse().find((l) => ALPHA.indexOf(l) <= i) ?? present[present.length - 1];
    if (hit === last.current) return;
    last.current = hit; setBubble(hit);
    document.getElementById(`g-${hit}`)?.scrollIntoView({ block: "start" });
    try { navigator.vibrate?.(5); } catch { /* not supported on iPhone */ }
  };
  const end = () => { last.current = null; setBubble(null); };
  return (
    <>
      <nav ref={ref} aria-label="Jump to letter" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); go(e.clientY); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") go(e.clientY); }} onPointerUp={end} onPointerCancel={end}
        className="fixed right-0 z-20 w-8 flex flex-col justify-between items-center touch-none select-none text-[10px] font-bold text-accent leading-none py-1"
        style={{ top: "calc(150px + env(safe-area-inset-top))", bottom: "calc(96px + env(safe-area-inset-bottom))" }}>
        {ALPHA.map((l) => <span key={l} className={present.includes(l) ? "" : "opacity-30"}>{l}</span>)}
      </nav>
      {bubble && <div aria-hidden className="fixed right-12 top-1/2 -translate-y-1/2 z-30 w-16 h-16 rounded-2xl bg-fg text-bg grid place-items-center text-3xl font-bold shadow-lg">{bubble}</div>}
    </>
  );
}

export default function ContactsBook({ cards, waitingNew = [] }: { cards: ContactCard[]; waitingNew?: string[] }) {
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
      {waitingNew.length > 0 && <div role="status" className="rounded-xl bg-amber-bg text-amber px-3 py-2 text-xs font-semibold mb-3">Being added to Apple Contacts (about 2 minutes, no need to add again): {waitingNew.join(", ")}</div>}
      {editing === "new" && <div className="rounded-xl border border-line mb-3 bg-bg"><ContactForm onDone={done} /></div>}
      {total === 0 && <div className="text-muted text-sm">No results{q ? ` for “${q}”` : ""}.</div>}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0 pr-7">
          {groups.map(([letter, rows]) => (
            <section key={letter} id={`g-${letter}`} className="mb-2" style={{ scrollMarginTop: "calc(44px + env(safe-area-inset-top) + 64px)" }}>
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
        {!q && groups.length > 3 && <IndexRail present={groups.map(([l]) => l)} />}
      </div>
    </div>
  );
}
