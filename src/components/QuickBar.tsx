"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ReportIssueSheet } from "@/components/ReportIssue";

// Persistent Ask box + "+" capture button on every working page (design principle: ask anywhere, capture anywhere).
export function QuickBar() {
  const path = usePathname(); const router = useRouter(); const [q, setQ] = useState(""); const [plus, setPlus] = useState(false); const [report, setReport] = useState(false);
  const [hidden, setHidden] = useState(false); const [focused, setFocused] = useState(false);
  // Hide on a scroll down, show on a scroll up (like Safari's toolbar); always shown near the top, while typing in it, or when the page cannot scroll.
  useEffect(() => {
    let last = window.scrollY, ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, dy = y - last; last = y; ticking = false;
        if (focused || y < 40) setHidden(false);
        else if (dy > 6 && y > 80) setHidden(true);
        else if (dy < -6) setHidden(false);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [focused]);
  useEffect(() => { setHidden(false); }, [path]);
  useEffect(() => { document.documentElement.dataset.askbar = hidden && !focused ? "hidden" : "shown"; }, [hidden, focused]);
  if (["/login", "/ask", "/tv", "/kid", "/privacy", "/terms"].some((p) => path.startsWith(p))) return null;
  return (
    <>
    <ReportIssueSheet open={report} onClose={() => setReport(false)} />
    <div className={`fixed left-0 right-0 bottom-[var(--bar-bottom)] pointer-events-none transition-[transform,opacity] duration-200 ${hidden && !focused ? "translate-y-[140%] opacity-0" : ""}`}>
      <div className="max-w-md mx-auto px-5 flex gap-2 items-end pointer-events-auto">
        <form className="flex-1 flex" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/ask?q=${encodeURIComponent(q.trim())}`); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="Ask anything…" aria-label="Ask" className="w-full min-h-11 rounded-full border border-line bg-bg/95 backdrop-blur px-4 shadow-sm text-sm" />
        </form>
        <div className="relative">
          {plus && (
            <div className="absolute bottom-12 right-0 card shadow-lg flex flex-col gap-1 w-44 text-sm font-semibold">
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => { setPlus(false); router.push("/inbox?capture=photo"); }}>Take photo</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => { setPlus(false); router.push("/inbox?capture=file"); }}>Upload file</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => { setPlus(false); router.push("/inbox?capture=bulk"); }}>Bulk drop</button>
              <div className="border-t border-line my-0.5" />
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft text-amber" onClick={() => { setPlus(false); setReport(true); }}>Report a problem</button>
            </div>
          )}
          <button aria-label="Add" onClick={() => setPlus((v) => !v)} className="w-11 h-11 rounded-full bg-accent text-white text-2xl leading-none shadow-md">+</button>
        </div>
      </div>
    </div>
    </>
  );
}
