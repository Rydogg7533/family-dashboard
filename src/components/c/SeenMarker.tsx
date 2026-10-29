"use client";
import { useEffect } from "react";
import { markThreadSeen } from "@/app/messages/actions";

// Mounted on a thread page: marks that thread's replies seen and asks the tab bar to recount.
export function SeenMarker({ threadId }: { threadId: string }) {
  useEffect(() => { markThreadSeen(threadId).then(() => window.dispatchEvent(new Event("badges:refresh"))).catch(() => {}); }, [threadId]);
  return null;
}
