"use client";
import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { useBeforePaint } from "@/lib/use-before-paint";
import { usePathname } from "next/navigation";
import { AskChat } from "@/components/AskChat";

// Ask, in place (decision 2026-10-27): the + button opens the same Ask as the tab, as a sheet over the page the
// person is on, so a question never costs them their place. One thread, two doors: what is asked here is on
// the Ask tab too (same window, same history), and closing only hides it. Four ways to close: the X, the
// Done button, a tap on the dimmed page, or Escape. If a confirm card is still waiting the sheet asks once.
// What the keyboard measured last time, so the next open reserves exactly the right space.
const KEYBOARD_KEY = "ask-keyboard-height";

export function AskSheet({ open, onClose, who, sample, voice = false }: { open: boolean; onClose: () => void; who: string; sample: boolean; voice?: boolean }) {
  const path = usePathname();
  const [pending, setPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Swipe down on the grab bar or the header to close (the thread itself scrolls, so the drag lives on the
  // top edge only, as iOS sheets do). Past 80px it closes; short of that it springs back.
  const [drag, setDrag] = useState<{ start: number; dy: number } | null>(null);
  const onTouchStart = (e: ReactTouchEvent) => setDrag({ start: e.touches[0].clientY, dy: 0 });
  const onTouchMove = (e: ReactTouchEvent) => setDrag((d) => (d ? { ...d, dy: Math.max(0, e.touches[0].clientY - d.start) } : d));
  const onTouchEnd = () => { const dy = drag?.dy ?? 0; setDrag(null); if (dy > 80) tryClose(); };
  const onPending = useCallback((p: boolean) => setPending(p), []);
  // One header row (Ryan, 2026-10-28): the sheet's own row carries New chat, so the thread does not add a second row.
  const [controls, setControls] = useState<{ hasMessages: boolean; newChat: () => void } | null>(null);
  const onControls = useCallback((c: { hasMessages: boolean; newChat: () => void }) => setControls(c), []);
  const tryClose = useCallback(() => { if (pending) setConfirmClose(true); else onClose(); }, [pending, onClose]);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") tryClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, tryClose]);
  useEffect(() => { if (!open) setConfirmClose(false); }, [open]);
  // The page behind holds still while the sheet is up. iPhone Safari ignores overflow:hidden on the body, so the
  // body is pinned (position:fixed at its current scroll) and put back when the sheet closes.
  useBeforePaint(() => {
    if (!open) return;
    const y = window.scrollY;
    const b = document.body.style;
    const h = document.documentElement.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, htmlOverflow: h.overflow };
    b.position = "fixed"; b.top = `-${y}px`; b.left = "0"; b.right = "0"; b.width = "100%";
    // The root too: pinning the body alone still let iPhone Safari pan the page when the keyboard opened, and that
    // pan is visible through the scrim at the top of the screen -- which is the shake (Ryan's recording, 2026-10-28:
    // the top 290px, which the sheet never reaches, changes across eleven frames as the keyboard arrives).
    h.overflow = "hidden";
    // Pinning still left the page visible through the scrim while iPhone Safari panned it for the keyboard (Ryan's
    // second recording, 2026-10-28 23:12: the Today page behind the sheet drops by ~50px for a few frames as the
    // keyboard rises, and jumps back when it goes). So the page behind is not shown at all while the sheet is up:
    // everything that is not the sheet is hidden, and the scrim is solid. A pan of something invisible is not a shake.
    // Hide every sibling on the way up from the overlay to the body (the overlay sits inside the app's wrappers).
    const hidden: HTMLElement[] = [];
    for (let node: HTMLElement | null = overlayRef.current; node && node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) if (sib !== node && sib instanceof HTMLElement && sib.tagName !== "SCRIPT" && sib.tagName !== "STYLE") hidden.push(sib);
    }
    const prevVis = hidden.map((el) => el.style.visibility);
    for (const el of hidden) el.style.visibility = "hidden";
    return () => { hidden.forEach((el, i) => { el.style.visibility = prevVis[i]; }); b.position = prev.position; b.top = prev.top; b.left = prev.left; b.right = prev.right; b.width = prev.width; h.overflow = prev.htmlOverflow; window.scrollTo(0, y); };
  }, [open]);
  // With the keyboard up, iPhone Safari shrinks the visual viewport but not the layout one, so a plain fixed
  // overlay leaves a strip of page showing between the input and the keyboard. The overlay follows the visual
  // viewport instead: its top and height are set from visualViewport, so the scrim and the sheet always fill
  // exactly what is on screen.
  // The keyboard is the hard part (Ryan, 2026-10-28: still shaky). iPhone Safari fires a stream of visualViewport
  // resize events while the keyboard slides up. Two things made that stream visible:
  //   - it was React state, so every event re-rendered the sheet and the whole thread;
  //   - the sheet's height was a percentage of a container that was shrinking each frame, so its TOP edge was
  //     recomputed frame by frame instead of the sheet simply riding up with the keyboard.
  // So the overlay's geometry is written straight to the node, with no render, and the sheet's own height is only
  // recomputed once the viewport has been still for a moment. While the keyboard animates the sheet keeps its height
  // and its bottom follows the viewport: it slides, it does not reflow.
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useBeforePaint(() => {
    if (!open) return;
    const v = window.visualViewport;
    if (!v) return;
    // The keyboard's space is reserved before it arrives, so nothing resizes when it does (Ryan, 2026-10-28, after a
    // screen recording showed the sheet's top edge moving five times while the keyboard rose through its opening
    // animation). The sheet opens at the size it will have WITH the keyboard up, the input is focused, and the
    // keyboard then rises into space that is already empty: two things moving up together, no reflow.
    // A web page cannot ask iOS how tall the keyboard is, so the first open on a device uses a proportion and the
    // real height is measured and kept for every open after that. If the keyboard never comes (hardware keyboard, or
    // the focus is refused) the reservation is handed back after 800ms.
    const h0 = v.height;
    const saved = Number((() => { try { return window.localStorage.getItem(KEYBOARD_KEY); } catch { return null; } })() ?? 0);
    const reserve = saved > 120 && saved < h0 * 0.7 ? saved : Math.round(h0 * 0.42);
    let released = false, settle: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      const o = overlayRef.current;
      const gap = released ? 0 : reserve;
      if (o) { o.style.top = `${v.offsetTop}px`; o.style.height = `${Math.max(240, v.height - gap)}px`; o.style.bottom = "auto"; }
      clearTimeout(settle);
      settle = setTimeout(() => { const sh = sheetRef.current; if (sh) sh.style.maxHeight = `${Math.round(Math.max(240, v.height - (released ? 0 : reserve)) * 0.85)}px`; }, 150);
    };
    const onViewport = () => {
      const shrunk = h0 - v.height;
      if (!released && shrunk > 120) {
        // The keyboard is up: the space it takes is now real, so stop reserving and remember its height.
        released = true;
        try { window.localStorage.setItem(KEYBOARD_KEY, String(Math.round(shrunk))); } catch { /* fine */ }
      }
      apply();
    };
    apply();
    const giveBack = setTimeout(() => { if (!released) { released = true; apply(); } }, 800);
    v.addEventListener("resize", onViewport); v.addEventListener("scroll", onViewport);
    return () => { clearTimeout(settle); clearTimeout(giveBack); v.removeEventListener("resize", onViewport); v.removeEventListener("scroll", onViewport); };
  }, [open]);
  if (!open) return null;
  return (
    <div ref={overlayRef} className="fixed left-0 right-0 top-0 bottom-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Ask">
      <button aria-label="Close" className="ask-scrim absolute left-0 right-0 -top-[100vh] -bottom-[100vh] bg-bg touch-none" onClick={tryClose} />
      <div ref={sheetRef} className={`ask-sheet relative w-full max-w-md bg-bg rounded-t-2xl border-t-2 border-accent px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-2 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] max-h-[85%] overscroll-contain ${drag ? "" : "transition-transform duration-150"}`} style={{ transform: drag?.dy ? `translateY(${drag.dy}px)` : undefined }}>
        <div className="flex items-center justify-between touch-none" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-line" />
          <div className="font-semibold text-sm text-accent flex items-center gap-2"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-accent" />Ask</div>
          <div className="flex items-center gap-1">
            {controls?.hasMessages && (
              <button type="button" onClick={controls.newChat} aria-label="New chat" title="New chat" className="min-h-9 min-w-9 grid place-items-center rounded-full text-muted">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </button>
            )}
            <button type="button" onClick={tryClose} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold">Done</button>
          </div>
        </div>
        {confirmClose ? (
          <div className="card flex flex-col gap-2 border-amber">
            <div className="text-sm">A card is still waiting for your tap. Leave it undone? It stays on the Ask tab.</div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold text-sm">Leave</button>
              <button type="button" onClick={() => setConfirmClose(false)} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Back</button>
            </div>
          </div>
        ) : (
          <AskChat prefill="" sample={sample} who={who} embedded source={`page:${path}`} onPending={onPending} onControls={onControls} autoVoice={voice} />
        )}
      </div>
    </div>
  );
}
