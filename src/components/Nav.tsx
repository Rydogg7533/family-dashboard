"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today" },
  { href: "/tasks", label: "Tasks" },
  { href: "/health", label: "Health" },
  { href: "/register", label: "Sources" },
  { href: "/log", label: "Log" },
];

export function Nav() {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 border-t border-line bg-bg">
      <div className="max-w-md mx-auto flex justify-around px-1 pt-2 pb-[max(18px,env(safe-area-inset-bottom))] text-[11px] font-semibold">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
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
