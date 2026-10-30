"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isAuthScreen } from "@/lib/frameless";

// The page column, and the app's one scroller (#page): html/body are pinned to the viewport and this element scrolls,
// so the iOS rubber band is elastic at both ends while the fixed top bar and tab bar never move (see src/lib/scroller.ts).
// Framed pages (and the kid, legal and TV pages) reserve room for the top bar and tab bar; the sign-in, set-up and
// password-reset screens do not, so their content is not pushed down by a bar that is not there.
export function MainFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const frameless = isAuthScreen(path);
  // The window used to start every page at the top; the column has to do that itself.
  useEffect(() => { document.getElementById("page")?.scrollTo({ top: 0 }); }, [path]);
  return (
    <main id="page" className="flex-1 min-h-0 w-full overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className={`max-w-md mx-auto px-5 ${frameless ? "pt-[calc(env(safe-area-inset-top)+96px)] pb-8" : "pt-[calc(44px+env(safe-area-inset-top)+16px)] pb-[var(--page-bottom)]"}`}>{children}</div>
    </main>
  );
}
