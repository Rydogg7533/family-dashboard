import Link from "next/link";
import { H1, Card } from "@/components/ui";
import { getFeed, type FeedRow } from "@/lib/feed";
import { ago } from "@/lib/data";

export const dynamic = "force-dynamic";

// The Assistant feed (D73): what the assistant proposed, did, was told no on, or could not do. Newest first.
const FILTERS: [string, string][] = [["needs", "Needs you"], ["done", "Done"], ["declined", "Declined"], ["all", "All"]];
const BADGE: Record<string, { label: string; cls: string }> = {
  needs_you: { label: "Needs you", cls: "bg-amber-bg text-amber" },
  done: { label: "Done", cls: "bg-soft text-green" },
  declined: { label: "You said no", cls: "bg-soft text-muted" },
  failed: { label: "Did not work", cls: "bg-soft text-red" },
  superseded: { label: "Replaced by an edit", cls: "bg-soft text-muted" },
  info: { label: "Note", cls: "bg-soft text-muted" },
};

export default async function Assistant({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { rows, inbox } = await getFeed();
  const open = rows.filter((r) => r.status === "needs_you");
  const f = typeof sp.f === "string" ? sp.f : open.length + inbox.length ? "needs" : "all";
  const shown: FeedRow[] = f === "needs" ? open : f === "done" ? rows.filter((r) => r.status === "done") : f === "declined" ? rows.filter((r) => r.status === "declined" || r.status === "superseded") : rows;
  const counts: Record<string, number> = { needs: open.length + inbox.length, done: rows.filter((r) => r.status === "done").length, declined: rows.filter((r) => r.status === "declined").length, all: rows.length };
  const decided = rows.filter((r) => r.status === "done" || r.status === "declined" || r.status === "failed");
  const rate = decided.length >= 5 ? Math.round((decided.filter((r) => r.status === "done").length / decided.length) * 100) : null;
  return (
    <>
      <H1>Assistant</H1>
      <p className="text-xs text-muted mb-3">Everything the assistant proposed, did, or was told no on, with who asked. It never acts on its own here: each change waits for a tap. <Link href="/log" className="font-semibold text-accent">Full activity log</Link></p>
      <div className="flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none]">
        {FILTERS.map(([k, l]) => <Link key={k} href={`/assistant?f=${k}`} className={`shrink-0 min-h-10 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5 ${f === k ? "bg-accent text-white" : "bg-soft"}`}>{l}<span className="text-xs opacity-80">{counts[k]}</span></Link>)}
      </div>
      {rate !== null && <div className="text-[11px] text-muted mb-2">{rate}% of what it proposed to you was accepted ({decided.length} decided). This is what decides when it may do more on its own.</div>}
      <div className="flex flex-col gap-2 mt-1">
        {f === "needs" && inbox.map((i) => (
          <Link key={i.id} href="/inbox"><Card className="border-amber"><div className="text-[11px] font-bold tracking-wide text-amber">NEEDS YOU · INBOX</div><div className="text-sm font-semibold">{i.title}</div><div className="text-sm text-muted">{i.missing}</div><div className="text-[11px] text-muted mt-1">{i.requested_by} · {ago(i.captured_at)}</div></Card></Link>
        ))}
        {shown.length === 0 && !(f === "needs" && inbox.length) && <Card className="text-muted text-sm">{f === "needs" ? "Nothing is waiting for you." : "Nothing here yet."}</Card>}
        {shown.map((r) => {
          const b = BADGE[r.status] ?? BADGE.info;
          const body = (
            <Card className={r.status === "needs_you" ? "border-amber" : ""}>
              <div className="flex items-center gap-2"><span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${b.cls}`}>{b.label}</span><span className="text-[11px] text-muted uppercase tracking-wide">{r.source}</span></div>
              <div className="text-sm font-semibold mt-1">{r.title}</div>
              {r.detail && <div className="text-sm text-muted">{r.detail}</div>}
              <div className="text-[11px] text-muted mt-1">{r.actor} asked · {ago(r.at)}</div>
            </Card>
          );
          return r.link ? <Link key={r.id} href={r.link}>{body}</Link> : <div key={r.id}>{body}</div>;
        })}
      </div>
    </>
  );
}
