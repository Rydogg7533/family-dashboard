import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages, getThread, getSuggestions, getPinned, clock } from "@/lib/data-messages";
import { PinButton } from "@/components/c/PinButton";
import { getSyncStatus } from "@/lib/data-day";
import { ThreadView } from "@/components/c/MessagesView";
import { SeenMarker } from "@/components/c/SeenMarker";
import { ThreadAvatar } from "@/components/c/Avatar";
import { getViewer } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: PageProps<"/messages/[thread]">) {
  const { thread: id } = await params;
  const [thread, messages, sync, suggestions, viewer, pinnedIds] = await Promise.all([getThread(id), getMessages(id), getSyncStatus(["messages"]), getSuggestions(id), getViewer(), getPinned()]);
  if (!thread) notFound();
  const mirror = sync[0];
  return (
    <>
      {/* Like the Messages app: back on the left, the avatar and name centred, status on the right. Stays put under
          the top bar while the thread scrolls (sticky, offset by the top bar's height). */}
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-5 px-5 -mt-4 pt-2 pb-2 mb-2 bg-bg border-b border-line/60 flex items-center justify-between">
        <Link href="/messages" aria-label="Back to Messages" className="min-w-9 min-h-9 flex items-center justify-center rounded-lg hover:bg-soft text-accent font-bold text-xl">‹</Link>
        <div className="flex flex-col items-center min-w-0">
          <ThreadAvatar members={thread.kind === "assistant" ? ["Assistant"] : thread.members.filter((m) => m !== viewer.name)} photos={thread.avatars} size={40} />
          <h1 className="text-sm font-bold truncate max-w-[60vw] mt-1">{thread.name}</h1>
        </div>
        <span className="flex items-center gap-1 shrink-0">
          <span className={`text-[11px] font-semibold ${mirror?.state === "ok" ? "text-green" : "text-amber"}`}>{mirror?.state === "ok" ? "● live" : "● paused"}</span>
          <PinButton threadId={id} pinned={pinnedIds.includes(id)} />
        </span>
      </div>
      <ThreadView thread={thread} messages={messages} mirrorOk={mirror?.state === "ok"} suggestions={suggestions} />
      <SeenMarker threadId={id} />
    </>
  );
}
