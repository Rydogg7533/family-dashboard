// The tab bar catalog. A person's bar is a list of these keys stored in profiles.tab_bar (null = DEFAULT_TABS).
// The bar fits up to FIXED_MAX tabs without scrolling; past that it scrolls and snaps back when left alone.
// "more" is always present and always last: it is the way to everything not on the bar.
import { MORE_LINKS, MORE_GROUPS, type MoreGroupId } from "@/lib/more-links";

export type TabKey = string;
export type Tab = { key: TabKey; label: string; href: string; icon: string; badge?: "todayNew" | "messages" | "inboxHanded"; group?: MoreGroupId };

// The four built-ins plus everything under More, in More's own groups, so the chooser shows the same catalog the
// More page does. Key = the href without its leading slash ("money/receipts"); "today" and "more" are fixed.
const BUILT_IN: Tab[] = [
  { key: "today", label: "Today", href: "/", icon: "sun", badge: "todayNew" },
  { key: "ask", label: "Ask", href: "/ask", icon: "sparkles" },
  { key: "tasks", label: "Tasks", href: "/tasks", icon: "list" },
  { key: "money", label: "Money", href: "/money", icon: "wallet" },
];
const BADGE: Record<string, Tab["badge"]> = { "/messages": "messages", "/inbox": "inboxHanded" };
export const TAB_CATALOG: Tab[] = [
  ...BUILT_IN,
  ...MORE_LINKS.filter((l) => !BUILT_IN.some((b) => b.href === l.href)).map((l) => ({ key: l.href.replace(/^\//, ""), label: l.label, href: l.href, icon: l.icon, badge: BADGE[l.href], group: l.group })),
  { key: "more", label: "More", href: "/more", icon: "grid" },
];
export const TAB_GROUPS = [{ id: "core" as const, label: "Core" }, ...MORE_GROUPS.map((g) => ({ id: g.id, label: g.label }))];
export const DEFAULT_TABS: TabKey[] = ["today", "ask", "messages", "money", "more"];
export const FIXED_MAX = 5;      // phones: this many fit without scrolling
export const FIXED_MAX_WIDE = 7; // tablets and desktops
export const SNAP_BACK_MS = 4000;

const byKey = new Map(TAB_CATALOG.map((t) => [t.key, t]));
export const tabByKey = (k: string) => byKey.get(k);
// Unknown keys are dropped (a tab removed from the catalog later), "more" is forced to the end, duplicates collapse.
export function resolveTabs(keys: string[] | null | undefined): Tab[] {
  const seen = new Set<string>();
  const out: Tab[] = [];
  for (const k of keys?.length ? keys : DEFAULT_TABS) { const t = byKey.get(k); if (t && t.key !== "more" && !seen.has(t.key)) { seen.add(t.key); out.push(t); } }
  out.push(byKey.get("more")!);
  return out;
}
