"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isFrameless } from "@/lib/frameless";
import { useCallback, useEffect, useRef, useState } from "react";
import { FIXED_MAX, FIXED_MAX_WIDE, SNAP_BACK_MS, resolveTabs, type Tab, type TabKey } from "@/lib/tabs";
import { MoreIcon } from "@/components/MoreIcons";
import { createClient } from "@/lib/supabase/client";

const moreRoots = ["/more", "/family", "/vehicles", "/messages", "/inbox", "/calendar", "/recurring", "/documents", "/log", "/settings", "/info", "/health", "/register", "/shop", "/day", "/devices", "/health-meds", "/contacts", "/home", "/places", "/reports", "/household", "/sources", "/meds", "/emergency", "/voice", "/records", "/home-property", "/mail"];
type Badges = { inboxHanded: number; todayNew: number; messages: number };
const NONE: Badges = { inboxHanded: 0, todayNew: 0, messages: 0 };

// The bottom tab bar. Which tabs and in what order come from the person's profile (src/lib/tabs.ts); the bar
// fits FIXED_MAX tabs as a plain row and scrolls past that, snapping back to the start when left alone.
// Badges: Today's new count, Inbox items handed to me, and unread replies in Messages, which also refresh the
// moment a notification row changes (Realtime) so a reply shows within a second of the mirror writing it.
export function Nav({ tabKeys, live = true }: { tabKeys: TabKey[]; live?: boolean }) {
  const path = usePathname();
  const [badges, setBadges] = useState<Badges>(NONE);
  const navRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const hidden = isFrameless(path);
  const tabs = resolveTabs(tabKeys);
  // tabs the person chose that are not on the bar are reached through More; More is active for anything not on the bar
  const onBar = new Set(tabs.map((t) => t.href));
  const extraRoots = moreRoots.filter((r) => !onBar.has(r));

  const refresh = useCallback(() => {
    fetch("/api/badges", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setBadges({ inboxHanded: Number(j.inboxHanded) || 0, todayNew: Number(j.todayNew) || 0, messages: Number(j.messages) || 0 }); }).catch(() => {});
  }, []);
  useEffect(() => { if (!hidden) refresh(); }, [path, hidden, refresh]);
  useEffect(() => {
    // a thread page marks its replies seen and asks the bar to recount
    const onSeen = () => refresh();
    window.addEventListener("badges:refresh", onSeen);
    return () => window.removeEventListener("badges:refresh", onSeen);
  }, [refresh]);
  useEffect(() => {
    if (hidden || !live) return;
    // my notification rows change → recount. RLS keeps this to my own rows.
    let sb: ReturnType<typeof createClient> | null = null;
    try { sb = createClient(); } catch { return; }
    const ch = sb.channel("badges").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => refresh()).subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); sb?.removeChannel(ch); };
  }, [hidden, live, refresh]);

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

  // Overflow: more tabs than fit → the row scrolls; the current page's tab is brought into view on arrival, and the row
  // slides back to the start SNAP_BACK_MS after the last touch so the bar always looks the same when you glance at it.
  const [wide, setWide] = useState(false);
  useEffect(() => { const mq = window.matchMedia("(min-width: 768px)"); const on = () => setWide(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  const scrolls = tabs.length > (wide ? FIXED_MAX_WIDE : FIXED_MAX);
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !scrolls) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => row.scrollTo({ left: 0, behavior: "smooth" }), SNAP_BACK_MS); };
    const onScroll = () => arm();
    row.addEventListener("scroll", onScroll, { passive: true });
    const active = row.querySelector<HTMLElement>("[data-active='true']");
    if (active) { active.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); arm(); }
    return () => { clearTimeout(timer); row.removeEventListener("scroll", onScroll); };
  }, [scrolls, path]);

  if (hidden) return null;
  const isActive = (t: Tab) => t.href === "/" ? path === "/" : t.key === "more" ? extraRoots.some((r) => path.startsWith(r)) : path.startsWith(t.href);
  const count = (t: Tab) => (t.badge ? badges[t.badge] : 0);
  const more = tabs[tabs.length - 1], row = tabs.slice(0, -1);
  const tab = (t: Tab) => {
    const active = isActive(t), n = count(t);
    return (
      <Link key={t.key} href={t.href} prefetch={t.href === "/ask" ? undefined : true} data-active={active}
        aria-label={n ? `${t.label}, ${n} new` : t.label} aria-current={active ? "page" : undefined}
        className={`shrink-0 snap-start pt-3 pb-0.5 flex flex-col items-center justify-end gap-1 ${scrolls ? "w-[25%] min-w-[64px]" : "flex-1 min-w-[60px]"} ${active ? "text-accent" : "text-muted"}`}>
        <span data-active={active} className="tabbar-pill relative flex items-center justify-center w-16 h-8">
          <MoreIcon name={t.icon} size={22} strokeWidth={active ? 2.25 : 1.75} />
          {n > 0 && <span className="absolute -top-1.5 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white text-[10px] leading-[18px] text-center font-bold ring-2 ring-bg">{n > 99 ? "99+" : n}</span>}
        </span>
        <span className="leading-none">{t.label}</span>
      </Link>
    );
  };
  // More is pinned at the right edge; the other tabs scroll behind it when there are more than fit.
  // .tabbar / .tabbar-wrap / .tabbar-pill are styled in globals.css and follow Look and feel (strip or floating island).
  return (
    <nav ref={navRef} className="tabbar-wrap fixed bottom-0 inset-x-0">
      <div className="tabbar max-w-md mx-auto">
        <div className="tabbar-row flex items-stretch px-2 pb-[max(16px,env(safe-area-inset-bottom))] text-[11px] font-semibold">
          <div ref={rowRef} className={`flex flex-1 min-w-0 ${scrolls ? "overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""}`}>
            {row.map(tab)}
          </div>
          <div className={`shrink-0 flex ${scrolls ? "ml-1 pl-1 border-l border-line/70" : ""}`}>{tab(more)}</div>
        </div>
      </div>
    </nav>
  );
}
