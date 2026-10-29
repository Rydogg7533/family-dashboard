import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages, getThread, getSuggestions, clock } from "@/lib/data-messages";
import { getSyncStatus } from "@/lib/data-day";
import { ThreadView } from "@/components/c/MessagesView";
import { SeenMarker } from "@/components/c/SeenMarker";
import { ThreadAvatar } from "@/components/c/Avatar";
import { getViewer } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: PageProps<"/messages/[thread]">) {
  const { thread: id } = await params;
  const [thread, messages, sync, suggestions, viewer] = await Promise.all([getThread(id), getMessages(id), getSyncStatus(["messages"]), getSuggestions(id), getViewer()]);
  if (!thread) notFound();
  const mirror = sync[0];
  return (
    <>
      {/* Like the Messages app: back on the left, the avatar and name centred, status on the right. */}
      <div className="flex items-center justify-between mb-3">
        <Link href="/messages" aria-label="Back to Messages" className="min-w-9 min-h-9 flex items-center justify-center rounded-lg hover:bg-soft text-accent font-bold text-xl">‹</Link>
        <div className="flex flex-col items-center min-w-0">
          <ThreadAvatar members={thread.kind === "assistant" ? ["Assistant"] : thread.members.filter((m) => m !== viewer.name)} size={40} />
          <h1 className="text-sm font-bold truncate max-w-[60vw] mt-1">{thread.name}</h1>
        </div>
        <span className={`text-[11px] font-semibold shrink-0 min-w-9 text-right ${mirror?.state === "ok" ? "text-green" : "text-amber"}`}>{mirror?.state === "ok" ? "● live" : "● paused"}</span>
      </div>
      <ThreadView thread={thread} messages={messages} mirrorOk={mirror?.state === "ok"} suggestions={suggestions} />
      <SeenMarker threadId={id} />
    </>
  );
}
