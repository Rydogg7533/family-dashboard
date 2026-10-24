"use client";
import { usePathname } from "next/navigation";
import { isAuthScreen } from "@/lib/frameless";

// The page column. Framed pages (and the kid, legal and TV pages) reserve room for the top bar and tab bar; the sign-in, set-up and password-reset screens do not,
// so their content is not pushed down by a bar that is not there.
export function MainFrame({ children }: { children: React.ReactNode }) {
  const frameless = isAuthScreen(usePathname());
  return (
    <main className={`flex-1 w-full max-w-md mx-auto px-5 ${frameless ? "pt-[env(safe-area-inset-top)] pb-8" : "pt-[calc(44px+env(safe-area-inset-top)+16px)] pb-[var(--page-bottom)]"}`}>{children}</main>
  );
}
