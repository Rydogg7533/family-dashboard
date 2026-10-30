"use client";
import { usePathname, useRouter } from "next/navigation";
import { isFrameless } from "@/lib/frameless";
import { useEffect, useState } from "react";
import { ReportIssueSheet } from "@/components/ReportIssue";
import { AskSheet } from "@/components/AskSheet";
import { Mic } from "lucide-react";
import { onScroll, scrollY } from "@/lib/scroller";

// Floating "+" on every working page: the handful of things done often from anywhere. Frequency earns a slot here
// (a calendar event is daily; adding a device is twice a year and stays a button on its own page). Ask itself is the Ask tab (one tap).
export function QuickBar({ who = "You", sample = false }: { who?: string; sample?: boolean }) {
  const path = usePathname(); const router = useRouter(); const [plus, setPlus] = useState(false); const [report, setReport] = useState(false); const [ask, setAsk] = useState(false); const [askVoice, setAskVoice] = useState(false); const [away, setAway] = useState(false);
  // The mic shows only when the server has a voice key (same check the Ask box makes); hidden until known.
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => { fetch("/api/voice/session", { method: "POST" }).then((r) => setVoiceOn(r.status !== 404)).catch(() => setVoiceOn(false)); }, []);
  useEffect(() => { setPlus(false); setAway(false); }, [path]);
  // Escape closes the menu too, for a keyboard; the transparent catcher below handles a tap outside it.
  useEffect(() => {
    if (!plus) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") setPlus(false); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [plus]);
  // Slides out of the way when you scroll down (so it never covers a button); a little scroll up, or the top of the page, brings it back.
  useEffect(() => {
    let last = scrollY();
    const on = () => { const y = scrollY(); if (y > last + 8 && y > 80) setAway(true); else if (y < last - 8 || y <= 80) setAway(false); last = y; };
    return onScroll(on);
  }, []);
  // No + on a conversation: the compose bar owns the bottom edge there.
  if (isFrameless(path) || path.startsWith("/ask") || /^\/messages\/[^/]+$/.test(path)) return null;
  const go = (href: string) => { setPlus(false); router.push(href); };
  return (
    <>
    <ReportIssueSheet open={report} onClose={() => setReport(false)} />
    <AskSheet open={ask} onClose={() => { setAsk(false); setAskVoice(false); }} who={who} sample={sample} voice={askVoice} />
    {plus && <div aria-hidden="true" onClick={() => setPlus(false)} className="fixed inset-0 z-20" />}
    <div className={`fixed left-0 right-0 bottom-[calc(var(--bar-bottom)+12px)] pointer-events-none z-20 transition-transform duration-200 ${away && !plus ? "translate-y-24" : ""}`}>
      <div className="max-w-md mx-auto px-5 flex flex-col items-end gap-3 pointer-events-auto">
        {/* System-wide voice (ported from MedRepDesk's voice FAB): one tap from any screen opens Ask already listening.
            Sits above the +, slightly quieter so the + stays the primary action. */}
        {voiceOn && !ask && (
          <button aria-label="Talk to the assistant" title="Talk to Ask (audio goes to OpenAI during a voice session)" onClick={() => { setPlus(false); setAskVoice(true); setAsk(true); }}
            className="w-11 h-11 rounded-full bg-accent/85 text-white shadow-md ring-2 ring-bg flex items-center justify-center active:scale-95 transition-transform">
            <Mic size={20} strokeWidth={2} />
          </button>
        )}
        <div className="relative">
          {plus && (
            <div className="absolute bottom-12 right-0 card shadow-lg flex flex-col gap-1 w-48 text-sm font-semibold">
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => go("/calendar/new")}>Add to calendar</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => go("/inbox?capture=photo")}>Take photo</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => go("/inbox?capture=file")}>Upload photos or files</button>
              <div className="border-t border-line my-0.5" />
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => { setPlus(false); setAsk(true); }}>Ask</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft text-amber" onClick={() => { setPlus(false); setReport(true); }}>Report a problem or request a feature</button>
            </div>
          )}
          <button aria-label="Add" aria-expanded={plus} onClick={() => { if (ask) { setAsk(false); return; } setPlus((v) => !v); }} className="w-11 h-11 rounded-full bg-accent text-white text-2xl leading-none shadow-md">+</button>
        </div>
      </div>
    </div>
    </>
  );
}
