"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { searchMessages } from "@/app/messages/actions";
import { ThreadAvatar } from "@/components/c/Avatar";
import type { Thread } from "@/lib/data-messages";
import { clock } from "@/lib/c-shared";

// Search like the Messages app: a field above the list; typing filters by name at once and by message text after a
// short pause. A text hit shows the matching line as the row's preview. Clearing the field puts the list back.
export function MessagesSearch({ threads, viewer, children }: { threads: Thread[]; viewer: string; children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ thread_id: string; text: string; at: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => { searchMessages(q).then((h) => { if (live) setHits(h); }).catch(() => {}); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const term = q.trim().toLowerCase();
  const byName = term ? threads.filter((t) => t.name.toLowerCase().includes(term) || t.members.some((m) => m.toLowerCase().includes(term))) : [];
  const byText = hits.map((h) => ({ t: threads.find((t) => t.id === h.thread_id), h })).filter((x): x is { t: Thread; h: typeof hits[number] } => !!x.t && !byName.includes(x.t));
  const othersOf = (t: Thread) => t.kind === "assistant" ? ["Assistant"] : t.members.filter((m) => m !== viewer);
  return (
    <>
      <div className="relative mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" inputMode="search" placeholder="Search" aria-label="Search conversations"
          className="w-full min-h-10 rounded-xl bg-soft px-9 text-[15px] outline-none focus:ring-2 focus:ring-accent/40" />
        <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">⌕</span>
        {q && <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted/30 text-xs font-bold">×</button>}
      </div>
      {term ? (
        <ul className="-mx-1">
          {[...byName.map((t) => ({ t, line: null as string | null, at: t.last_at })), ...byText.map((x) => ({ t: x.t, line: x.h.text, at: x.h.at }))].map(({ t, line, at }) => (
            <li key={t.id + (line ?? "")}>
              <Link href={`/messages/${t.id}`} className="flex items-center gap-3 px-1 py-2.5 min-h-[64px] border-b border-line/60 hover:bg-soft/60">
                <ThreadAvatar members={othersOf(t)} photos={t.avatars} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[15px] font-semibold">{t.name}</span><span className="shrink-0 text-xs text-muted">{clock(at)}</span></span>
                  <span className="block text-sm text-muted line-clamp-2">{line ?? t.last_line}</span>
                </span>
              </Link>
            </li>
          ))}
          {byName.length + byText.length === 0 && <li className="px-1 py-6 text-sm text-muted text-center">Nothing in the last 30 days. Start a new message to reach them.</li>}
        </ul>
      ) : children}
    </>
  );
}
