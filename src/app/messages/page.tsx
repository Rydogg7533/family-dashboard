import Link from "next/link";
import { getThreads, getConfirmations, clock } from "@/lib/data-messages";
import { getSyncStatus } from "@/lib/data-day";
import { Card, H1 } from "@/components/ui";
import { ThreadAvatar } from "@/components/c/Avatar";
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
      <H1 right={mirror ? <span className={`text-xs ${mirror.state === "ok" ? "text-green font-semibold" : "text-amber font-semibold"}`}>● {mirror.state === "ok" ? "live" : "paused"} · {clock(mirror.last_sync)}</span> : null}>Messages</H1>

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
      {/* Like the Messages app: a plain list, avatar left, bold name and grey preview, time right, hairline between rows. */}
      <ul className="mb-4 -mx-1">
        {threads.map((t) => {
          const others = t.kind === "assistant" ? ["Assistant"] : t.members.filter((m) => m !== viewer.name);
          return (
            <li key={t.id}>
              <Link href={`/messages/${t.id}`} className="flex items-center gap-3 px-1 py-2.5 min-h-[68px] border-b border-line/60 hover:bg-soft/60 active:bg-soft">
                <span className="relative shrink-0 w-3 flex justify-center">{t.unread > 0 && <span aria-label={`${t.unread} unread`} className="w-2.5 h-2.5 rounded-full bg-accent" />}</span>
                <ThreadAvatar members={others} photos={t.avatars} size={46} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[15px] ${t.unread > 0 ? "font-bold" : "font-semibold"}`}>{t.name}{t.kind === "assistant" && <span className="text-[11px] text-muted font-semibold ml-1">· AI</span>}</span>
                    <span className={`shrink-0 text-xs ${t.unread > 0 ? "text-accent font-semibold" : "text-muted"}`}>{clock(t.last_at)} <span aria-hidden className="text-muted">›</span></span>
                  </span>
                  <span className={`block text-sm leading-snug line-clamp-2 ${t.unread > 0 ? "text-fg" : "text-muted"}`}>{t.last_line}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>


      {mirror?.state !== "ok" && <section className="card"><SyncLine items={sync} /></section>}
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
