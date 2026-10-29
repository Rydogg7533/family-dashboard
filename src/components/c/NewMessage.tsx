"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchContacts, startThread, type ContactHit } from "@/app/messages/actions";
import { Disc } from "@/components/c/Avatar";
import { useToast } from "@/components/c/Toast";

// To: search Contacts, pick a person (and which number or email when they have several), then the first line.
export function NewMessage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [to, setTo] = useState<{ name: string; handle: string; photo: string | null } | null>(null);
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const { show, el } = useToast();
  useEffect(() => {
    if (to || q.trim().length < 2) { setHits([]); return; }
    let live = true; const t = setTimeout(() => searchContacts(q).then((h) => { if (live) setHits(h); }).catch(() => {}), 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, to]);
  const send = () => start(async () => {
    if (!to) return;
    const r = await startThread(to.handle, text);
    if (!r.ok) { show(r.error ?? "Could not send"); return; }
    show(r.sample ? "Sample mode: not sent" : `Sending to ${to.name} through Messages · the thread appears here in a moment`);
    setTimeout(() => router.push("/messages"), 1200);
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <span className="text-sm text-muted">To:</span>
        {to ? (
          <button onClick={() => { setTo(null); setQ(""); }} className="flex items-center gap-1.5 rounded-full bg-accent/12 text-accent px-2 py-1 text-sm font-semibold"><Disc name={to.name} src={to.photo} size={20} />{to.name}<span aria-hidden>×</span></button>
        ) : (
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" aria-label="Who to message" className="flex-1 min-h-9 bg-transparent outline-none text-[15px]" />
        )}
      </div>
      {!to && hits.length > 0 && (
        <ul className="-mx-1">
          {hits.map((c) => (
            <li key={c.id} className="px-1 py-2 border-b border-line/60">
              <div className="flex items-center gap-3"><Disc name={c.name} src={c.photo} size={36} /><span className="font-semibold">{c.name}</span></div>
              <div className="flex flex-wrap gap-1.5 mt-1.5 pl-12">
                {c.handles.map((h) => <button key={h.value} onClick={() => { setTo({ name: c.name, handle: h.value, photo: c.photo }); setHits([]); }} className="min-h-8 px-2.5 rounded-full bg-soft text-xs font-semibold"><span className="text-muted">{h.label} · </span>{h.value}</button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!to && q.trim().length >= 2 && hits.length === 0 && <div className="text-sm text-muted">No one by that name in your Contacts.</div>}
      {to && (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 items-end">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="iMessage" aria-label="Message" className="flex-1 rounded-2xl bg-soft px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-accent/40" />
          <button type="submit" disabled={busy || !text.trim()} className="min-h-11 px-4 rounded-full bg-accent text-white font-semibold disabled:opacity-40">Send</button>
        </form>
      )}
      {el}
    </div>
  );
}
