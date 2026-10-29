// The tab bar catalog. A person's bar is a list of these keys stored in profiles.tab_bar (null = DEFAULT_TABS).
// The bar fits up to FIXED_MAX tabs without scrolling; past that it scrolls and snaps back when left alone.
// "more" is always present and always last: it is the way to everything not on the bar.
export type TabKey = "today" | "ask" | "messages" | "tasks" | "money" | "calendar" | "inbox" | "mail" | "shop" | "family" | "more";
export type Tab = { key: TabKey; label: string; href: string; icon: string; badge?: "todayNew" | "messages" | "inboxHanded"; roots?: string[] };

export const TAB_CATALOG: Tab[] = [
  { key: "today", label: "Today", href: "/", icon: "sun", badge: "todayNew" },
  { key: "ask", label: "Ask", href: "/ask", icon: "sparkles" },
  { key: "messages", label: "Messages", href: "/messages", icon: "message", badge: "messages" },
  { key: "tasks", label: "Tasks", href: "/tasks", icon: "list" },
  { key: "money", label: "Money", href: "/money", icon: "wallet" },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "calendar" },
  { key: "inbox", label: "Inbox", href: "/inbox", icon: "inbox", badge: "inboxHanded" },
  { key: "mail", label: "Mail", href: "/mail", icon: "mail" },
  { key: "shop", label: "Shop", href: "/shop", icon: "cart" },
  { key: "family", label: "Family", href: "/family", icon: "users" },
  { key: "more", label: "More", href: "/more", icon: "grid" },
];
export const DEFAULT_TABS: TabKey[] = ["today", "ask", "messages", "money", "more"];
export const FIXED_MAX = 5;      // phones: this many fit without scrolling
export const FIXED_MAX_WIDE = 7; // tablets and desktops
export const SNAP_BACK_MS = 4000;

const byKey = new Map(TAB_CATALOG.map((t) => [t.key, t]));
// Unknown keys are dropped (a tab removed from the catalog later), "more" is forced to the end, duplicates collapse.
export function resolveTabs(keys: string[] | null | undefined): Tab[] {
  const seen = new Set<string>();
  const out: Tab[] = [];
  for (const k of keys?.length ? keys : DEFAULT_TABS) { const t = byKey.get(k as TabKey); if (t && t.key !== "more" && !seen.has(t.key)) { seen.add(t.key); out.push(t); } }
  out.push(byKey.get("more")!);
  return out;
}
