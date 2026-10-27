"use client";
import { useCallback, useEffect, useState, type TouchEvent as ReactTouchEvent } from "react";
import { usePathname } from "next/navigation";
import { AskChat } from "@/components/AskChat";

// Ask, in place (decision 2026-10-27): the + button opens the same Ask as the tab, as a sheet over the page the
// person is on, so a question never costs them their place. One thread, two doors: what is asked here is on
// the Ask tab too (same window, same history), and closing only hides it. Four ways to close: the X, the
// Done button, a tap on the dimmed page, or Escape. If a confirm card is still waiting the sheet asks once.
export function AskSheet({ open, onClose, who, sample }: { open: boolean; onClose: () => void; who: string; sample: boolean }) {
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
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width };
    b.position = "fixed"; b.top = `-${y}px`; b.left = "0"; b.right = "0"; b.width = "100%";
    return () => { b.position = prev.position; b.top = prev.top; b.left = prev.left; b.right = prev.right; b.width = prev.width; window.scrollTo(0, y); };
  }, [open]);
  // With the keyboard up, iPhone Safari shrinks the visual viewport but not the layout one, so a plain fixed
  // overlay leaves a strip of page showing between the input and the keyboard. The overlay follows the visual
  // viewport instead: its top and height are set from visualViewport, so the scrim and the sheet always fill
  // exactly what is on screen.
  const [vv, setVv] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (!open) { setVv(null); return; }
    const v = window.visualViewport;
    if (!v) return;
    const on = () => setVv({ top: v.offsetTop, height: v.height });
    on();
    v.addEventListener("resize", on); v.addEventListener("scroll", on);
    return () => { v.removeEventListener("resize", on); v.removeEventListener("scroll", on); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed left-0 right-0 z-50 flex items-end justify-center" style={vv ? { top: vv.top, height: vv.height } : { top: 0, bottom: 0 }} role="dialog" aria-modal="true" aria-label="Ask">
      <button aria-label="Close" className="absolute left-0 right-0 -top-[100vh] -bottom-[100vh] bg-black/75 backdrop-blur-sm touch-none" onClick={tryClose} />
      <div className={`relative w-full max-w-md bg-soft rounded-t-2xl border-t-2 border-accent px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-2 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] max-h-[85%] overscroll-contain ${drag ? "" : "transition-transform duration-150"}`} style={{ transform: drag?.dy ? `translateY(${drag.dy}px)` : undefined }}>
        <div className="flex items-center justify-between touch-none" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-line" />
          <div className="font-semibold text-sm text-accent flex items-center gap-2"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-accent" />Ask</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={tryClose} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold">Done</button>
            <button type="button" aria-label="Close" onClick={tryClose} className="min-h-9 min-w-9 grid place-items-center rounded-full bg-soft text-base leading-none">×</button>
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
          <AskChat prefill="" sample={sample} who={who} embedded source={`page:${path}`} onPending={onPending} />
        )}
      </div>
    </div>
  );
}
