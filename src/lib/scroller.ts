// The page scrolls inside its own column (#page in MainFrame), not the window, so iOS's rubber band happens inside the
// column and the fixed top bar and tab bar stay put (2026-10-30; before this the bounce was switched off app-wide
// because Safari drags fixed elements along with a window bounce). Everything that used window.scrollY goes through here.
export function scroller(): HTMLElement | null { return typeof document === "undefined" ? null : document.getElementById("page"); }
export function scrollY(): number { return scroller()?.scrollTop ?? 0; }
export function scrollHeight(): number { return scroller()?.scrollHeight ?? 0; }
export function scrollTo(top: number, behavior: ScrollBehavior = "auto") { scroller()?.scrollTo({ top, behavior }); }
export function onScroll(fn: () => void): () => void {
  const el = scroller(); if (!el) return () => {};
  el.addEventListener("scroll", fn, { passive: true }); return () => el.removeEventListener("scroll", fn);
}
