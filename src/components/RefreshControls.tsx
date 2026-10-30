"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scrollY } from "@/lib/scroller";

// Re-reads the current page from the server (and drops every preloaded page) so the newest data shows.
export function useRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return { pending, refresh: () => start(() => router.refresh()) };
}

export function RefreshButton() {
  const { pending, refresh } = useRefresh();
  return (
    <button type="button" onClick={refresh} disabled={pending} aria-label={pending ? "Refreshing" : "Refresh this page"} className="ml-auto shrink-0 w-11 h-11 -mr-3 flex items-center justify-center text-muted disabled:opacity-60">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={pending ? "animate-spin" : ""}>
        <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" />
      </svg>
    </button>
  );
}

// Pull down at the top of a page to refresh. Only when the app is opened from the Home Screen: in a Safari tab the browser's own pull-to-reload already does it.
export function PullToRefresh() {
  const { pending, refresh } = useRefresh();
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const standalone = useRef(false);
  useEffect(() => {
    standalone.current = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone.current) return;
    const down = (e: TouchEvent) => { start.current = scrollY() <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; };
    const move = (e: TouchEvent) => { if (start.current == null) return; const d = e.touches[0].clientY - start.current; if (d > 0 && scrollY() <= 0) setPull(Math.min(d * 0.5, 70)); else if (d <= 0) setPull(0); };
    const up = () => { if (start.current != null && pull >= 55) refresh(); start.current = null; setPull(0); };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up);
    return () => { document.removeEventListener("touchstart", down); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", up); };
  });
  if (pull === 0 && !pending) return null;
  return (
    <div aria-live="polite" className="fixed left-0 right-0 z-30 flex justify-center pointer-events-none top-[calc(44px+env(safe-area-inset-top)+4px)]" style={{ transform: `translateY(${pending ? 12 : pull / 2}px)` }}>
      <span className="card !py-1.5 !px-3 text-xs font-semibold shadow-md">{pending ? "Refreshing…" : pull >= 55 ? "Release to refresh" : "Pull to refresh"}</span>
    </div>
  );
}
