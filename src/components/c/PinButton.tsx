"use client";
import { useState, useTransition } from "react";
import { togglePin } from "@/app/messages/actions";
import { Pin, PinOff } from "lucide-react";

// Pin / unpin this conversation; pinned ones show as large avatars at the top of Messages.
export function PinButton({ threadId, pinned: initial }: { threadId: string; pinned: boolean }) {
  const [pinned, setPinned] = useState(initial);
  const [busy, start] = useTransition();
  return (
    <button aria-label={pinned ? "Unpin conversation" : "Pin conversation"} aria-pressed={pinned} disabled={busy}
      onClick={() => start(async () => { const r = await togglePin(threadId); if (r.ok) setPinned(!!r.pinned); })}
      className={`min-w-9 min-h-9 flex items-center justify-center rounded-lg ${pinned ? "text-accent" : "text-muted"} hover:bg-soft`}>
      {pinned ? <Pin size={18} strokeWidth={2.25} fill="currentColor" /> : <PinOff size={18} strokeWidth={1.75} />}
    </button>
  );
}
