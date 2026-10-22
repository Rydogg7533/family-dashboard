"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today" },
  { href: "/ask", label: "Ask" },
  { href: "/tasks", label: "Tasks" },
  { href: "/money", label: "Money" },
  { href: "/more", label: "More" },
];
const moreRoots = ["/more", "/family", "/vehicles", "/messages", "/inbox", "/calendar", "/recurring", "/documents", "/log", "/settings", "/info", "/health", "/register", "/shop", "/day", "/devices", "/health-meds", "/contacts", "/home", "/places", "/reports", "/household", "/sources", "/meds", "/emergency", "/voice", "/records", "/home-property", "/contacts"];

export function Nav() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/tv") || path.startsWith("/kid") || path === "/privacy" || path === "/terms") return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 border-t border-line bg-bg/95 backdrop-blur">
      <div className="max-w-md mx-auto flex justify-around px-1 pt-2 pb-[max(18px,env(safe-area-inset-bottom))] text-[11px] font-semibold">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : it.href === "/more" ? moreRoots.some((r) => path.startsWith(r)) : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={`min-w-[60px] min-h-11 flex flex-col items-center justify-center gap-1 ${active ? "text-accent" : "text-muted"}`}>
              <span className={`block w-[22px] h-[22px] rounded-md ${active ? "bg-accent" : "border-2 border-muted"}`} />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
