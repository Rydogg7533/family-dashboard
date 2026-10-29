import Link from "next/link";
import { getThreads, getConfirmations, clock } from "@/lib/data-messages";
import { getSyncStatus } from "@/lib/data-day";
import { Card, H1 } from "@/components/ui";
import { getPeople, getViewer } from "@/lib/data-registers";
import { SyncLine } from "@/components/c/SyncLine";
import { ConfirmCards } from "@/components/c/MessagesView";

export const dynamic = "force-dynamic";

// F16: a window on the person's own Messages threads (family only, last 30 days), mirrored by their own Mac.
// F17: the Assistant thread, with Y/N confirmations that can be answered here or by text.
export default async function Messages() {
  const [threads, confirmations, sync, viewer, people] = await Promise.all([getThreads(), getConfirmations(), getSyncStatus(["messages"]), getViewer(), getPeople()]);
  const otherParent = people.find((p) => p.role === "parent" && p.id !== viewer.id)?.name ?? null;
  const waiting = confirmations.filter((c) => c.status === "waiting");
  const mirror = sync[0];
  return (
    <>
      <H1 right={mirror ? <span className={mirror.state === "ok" ? "text-green font-semibold" : "text-amber font-semibold"}>● mirror {mirror.state === "ok" ? "live" : "paused"} · synced {clock(mirror.last_sync)}</span> : null}>Messages</H1>
      <p className="text-xs text-muted mb-3">A window on your own threads in the Messages app. Sending here sends there.</p>

      {waiting.length > 0 && (
        <section className="mb-4">
          <div className="flex items-baseline justify-between mb-2"><h2 className="text-base">Waiting for your Y or N</h2><span className="text-xs text-muted">{waiting.length}</span></div>
          <ConfirmCards items={waiting.slice(0, 5)} />
          {waiting.length > 5 && <Link href="/messages/assistant" className="text-sm font-semibold text-accent px-1">and {waiting.length - 5} more</Link>}
        </section>
      )}

      {threads.length === 0 && (
        <Card className="mb-4 text-sm">
          <div className="font-semibold mb-1">Not connected to Messages yet</div>
          <div className="text-muted text-xs">Your family threads appear here once the Messages mirror runs on the Mac mini. Typing here then sends through Messages as you, so it shows on your phone and everyone else&apos;s like any other text. Until then, use the Messages app.</div>
        </Card>
      )}
      <div className="flex flex-col gap-1.5 mb-4">
        {threads.map((t) => (
          <Link key={t.id} href={`/messages/${t.id}`} className="card flex justify-between items-center gap-2 min-h-14 !py-2.5">
            <div className="min-w-0">
              <div className={`flex items-center gap-1.5 ${t.unread > 0 ? "font-bold" : "font-semibold"}`}>{t.unread > 0 && <span aria-hidden className="w-2 h-2 rounded-full bg-accent shrink-0" />}<span className="truncate">{t.name}</span>{t.kind === "assistant" && <span className="text-[11px] text-muted font-semibold">· AI, by text</span>}{t.kind === "group" && <span className="text-[10px] font-bold uppercase tracking-wide text-accent bg-accent/12 rounded px-1.5 py-0.5 shrink-0">Group</span>}</div>
              <div className={`text-xs truncate ${t.unread > 0 ? "text-fg" : "text-muted"}`}>{t.last_line}</div>
              {t.kind === "group" && <div className="text-[10px] text-muted">{t.members.filter((m) => m !== viewer.name).join(", ")}</div>}
            </div>
            {t.unread > 0 ? <span className="shrink-0 text-[11px] font-bold text-white bg-accent rounded-full px-2 py-0.5">{t.unread}</span> : <span className="shrink-0 text-[11px] text-muted">{clock(t.last_at)}</span>}
          </Link>
        ))}
      </div>


      <section className="card"><SyncLine items={sync} /></section>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer list-none flex items-center gap-2"><span className="w-6 h-6 rounded-full border border-line text-accent font-bold flex items-center justify-center not-italic">i</span>About Messages</summary>
        <div className="mt-2 flex flex-col gap-1">
          <div>Family threads only · last 30 days · owner-only, encrypted at rest · full history stays in Messages and iCloud. Children's pages do not show Messages.</div>
          <div>Typing here sends through Messages as you, from your Mac. If the mirror pauses, use Messages directly.</div>
          {otherParent && <div>{otherParent}&apos;s one-to-one threads appear on their page once their own Mac runs the mirror with their consent.</div>}
          <a href="messages://" className="font-semibold text-accent">Open in Messages</a>
        </div>
      </details>
    </>
  );
}
