import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages, getThread, clock } from "@/lib/data-messages";
import { getSyncStatus } from "@/lib/data-day";
import { ThreadView } from "@/components/c/MessagesView";
import { SeenMarker } from "@/components/c/SeenMarker";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: PageProps<"/messages/[thread]">) {
  const { thread: id } = await params;
  const [thread, messages, sync] = await Promise.all([getThread(id), getMessages(id), getSyncStatus(["messages"])]);
  if (!thread) notFound();
  const mirror = sync[0];
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/messages" aria-label="Back to Messages" className="min-w-9 min-h-9 flex items-center justify-center rounded-lg hover:bg-soft text-accent font-bold">‹</Link>
          <h1 className="text-2xl truncate">{thread.name}</h1>
        </div>
        <span className={`text-xs font-semibold shrink-0 ${mirror?.state === "ok" ? "text-green" : "text-amber"}`}>● mirror {mirror?.state === "ok" ? "live" : "paused"}{mirror ? ` · ${clock(mirror.last_sync)}` : ""}</span>
      </div>
      <div className="text-xs text-muted mb-3">{thread.members.join(", ")} · <a href="messages://" className="font-semibold text-accent">Open in Messages</a></div>
      <ThreadView thread={thread} messages={messages} mirrorOk={mirror?.state === "ok"} />
      <SeenMarker threadId={id} />
    </>
  );
}
