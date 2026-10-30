"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// The Messages list is a server page; coming back to it from a thread showed the router's cached copy, dots and all
// (Ryan, 2026-10-30: "dots aren't clearing after I look at new messages"). Re-render when my notification rows change
// (Realtime: a thread marked seen, a new inbound line) and whenever the page becomes visible again.
export function ListRefresher({ live = true }: { live?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("badges:refresh", refresh);
    let sb: ReturnType<typeof createClient> | null = null, ch: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    if (live) {
      try { sb = createClient(); ch = sb.channel("messages-list").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refresh).subscribe(); } catch { /* sample mode */ }
    }
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("pageshow", refresh); window.removeEventListener("badges:refresh", refresh); if (sb && ch) sb.removeChannel(ch); };
  }, [router, live]);
  return null;
}
