"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ReportIssueSheet } from "@/components/ReportIssue";

// Floating "+" on every working page: capture, ask about this page, report a problem. Ask itself is the Ask tab (one tap).
export function QuickBar() {
  const path = usePathname(); const router = useRouter(); const [plus, setPlus] = useState(false); const [report, setReport] = useState(false);
  useEffect(() => { setPlus(false); }, [path]);
  // No + on a conversation: the compose bar owns the bottom edge there.
  if (["/login", "/ask", "/tv", "/kid", "/privacy", "/terms"].some((p) => path.startsWith(p)) || /^\/messages\/[^/]+$/.test(path)) return null;
  const go = (href: string) => { setPlus(false); router.push(href); };
  return (
    <>
    <ReportIssueSheet open={report} onClose={() => setReport(false)} />
    <div className="fixed left-0 right-0 bottom-[calc(var(--bar-bottom)+12px)] pointer-events-none z-20">
      <div className="max-w-md mx-auto px-5 flex justify-end pointer-events-auto">
        <div className="relative">
          {plus && (
            <div className="absolute bottom-12 right-0 card shadow-lg flex flex-col gap-1 w-48 text-sm font-semibold">
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => go("/inbox?capture=photo")}>Take photo</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => go("/inbox?capture=file")}>Upload file</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => go("/inbox?capture=bulk")}>Bulk drop</button>
              <div className="border-t border-line my-0.5" />
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => go(`/ask?about=${encodeURIComponent(path)}`)}>Ask about this page</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft text-amber" onClick={() => { setPlus(false); setReport(true); }}>Report a problem</button>
            </div>
          )}
          <button aria-label="Add" aria-expanded={plus} onClick={() => setPlus((v) => !v)} className="w-11 h-11 rounded-full bg-accent text-white text-2xl leading-none shadow-md">+</button>
        </div>
      </div>
    </div>
    </>
  );
}
