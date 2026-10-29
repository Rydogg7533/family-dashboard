"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isFrameless } from "@/lib/frameless";
import { useEffect, useRef, useState } from "react";

const items = [
  { href: "/", label: "Today" },
  { href: "/ask", label: "Ask" },
  { href: "/tasks", label: "Tasks" },
  { href: "/money", label: "Money" },
  { href: "/more", label: "More" },
];
const moreRoots = ["/more", "/family", "/vehicles", "/messages", "/inbox", "/calendar", "/recurring", "/documents", "/log", "/settings", "/info", "/health", "/register", "/shop", "/day", "/devices", "/health-meds", "/contacts", "/home", "/places", "/reports", "/household", "/sources", "/meds", "/emergency", "/voice", "/records", "/home-property", "/contacts", "/mail"];

export function Nav() {
  const path = usePathname();
  const [handed, setHanded] = useState(0);
  const [todayNew, setTodayNew] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const hidden = isFrameless(path);
  useEffect(() => {
    if (hidden) return;
    let live = true;
    fetch("/api/badges", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) { setHanded(Number(j.inboxHanded) || 0); setTodayNew(Number(j.todayNew) || 0); } }).catch(() => {});
    return () => { live = false; };
  }, [path, hidden]);
  useEffect(() => {
    // Keep fixed elements (compose bar, + button) flush with the real tab bar height.
    const el = navRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--bar-bottom", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hidden]);
  if (isFrameless(path)) return null;
  return (
    <nav ref={navRef} className="fixed bottom-0 inset-x-0 border-t border-line bg-bg/95 backdrop-blur">
      <div className="max-w-md mx-auto flex justify-around px-1 pt-2 pb-[max(18px,env(safe-area-inset-bottom))] text-[11px] font-semibold">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : it.href === "/more" ? moreRoots.some((r) => path.startsWith(r)) : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} prefetch={it.href === "/ask" ? undefined : true} className={`min-w-[60px] min-h-11 flex flex-col items-center justify-center gap-1 ${active ? "text-accent" : "text-muted"}`}>
              <span className="relative">
                <span className={`block w-[22px] h-[22px] rounded-md ${active ? "bg-accent" : "border-2 border-muted"}`} />
                {it.href === "/" && todayNew > 0 && <span aria-label={`${todayNew} new things need you`} className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white text-[10px] leading-[18px] text-center font-bold">{todayNew > 99 ? "99+" : todayNew}</span>}
                {it.href === "/more" && handed > 0 && <span aria-label={`${handed} Inbox items handed to you`} className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white text-[10px] leading-[18px] text-center font-bold">{handed}</span>}
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
