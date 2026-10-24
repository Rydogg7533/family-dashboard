"use client";
import { RefreshButton } from "@/components/RefreshControls";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Fixed header: always shows where you are (tab › section › page); page content scrolls underneath.
// The first crumb is always one of the five bottom tabs, so the header and the nav bar agree.
type Crumb = { label: string; href: string };

const MORE: Crumb = { label: "More", href: "/more" };
const MONEY: Crumb = { label: "Money", href: "/money" };

// Pages that live under the More tab (same set the bottom nav treats as More).
const moreTitles: Record<string, string> = {
  "/day": "Day", "/calendar": "Calendar", "/inbox": "Inbox", "/messages": "Messages", "/shop": "Shop",
  "/recurring": "Due dates and renewals", "/email-subscriptions": "Mailing lists", "/records": "Records", "/family": "Family", "/vehicles": "Vehicles", "/devices": "Devices",
  "/meds": "Medications", "/home-property": "Home and property", "/contacts": "Contacts", "/emergency": "Emergency plan",
  "/places": "Places", "/sources": "Sources", "/register": "Source register", "/health": "System health", "/log": "Log",
  "/voice": "Phone calls", "/claims": "Claims", "/settings": "Settings",
};
const subTitles: Record<string, string> = {
  "/shop/orders": "Orders", "/shop/cases": "Support cases",
  "/settings/people": "People and access", "/settings/appearance": "Look and feel", "/settings/modules": "My dashboard", "/settings/notifications": "Notifications", "/settings/connections": "Connections", "/settings/location": "Location", "/settings/contacts": "Contacts source", "/settings/filing-rules": "Filing rules", "/vehicles/new": "Add a vehicle",
};
const moneyTitles: Record<string, string> = {
  "/money/receipts": "Receipts", "/money/recurring": "Bills and charges", "/money/subscriptions": "Subscriptions",
};
// Where the page's own heading is longer than the short name used in parent crumbs, the bar uses the heading,
// so the page does not need to repeat it.
const pageTitle: Record<string, string> = {
  "/places": "Schedule and activities", "/meds": "Health and medications", "/register": "Sources",
  "/devices": "Devices and belongings", "/settings": "Settings",
};
// Detail pages: /<root>/<id> → label for the last crumb.
const detailLabel: Record<string, string> = {
  "/tasks": "Task", "/records": "Record", "/family": "Person", "/messages": "Conversation", "/money/reconcile": "Reconcile", "/vehicles": "Edit details",
};

export function crumbsFor(path: string): Crumb[] {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return [{ label: "Today", href: "/" }];
  if (p === "/ask") return [{ label: "Ask", href: "/ask" }];
  if (p === "/tasks") return [{ label: "Tasks", href: "/tasks" }];
  if (p === "/more") return [MORE];
  if (p === "/money") return [MONEY];

  if (p.startsWith("/tasks/")) return [{ label: "Tasks", href: "/tasks" }, { label: detailLabel["/tasks"], href: p }];

  if (p.startsWith("/money/")) {
    if (moneyTitles[p]) return [MONEY, { label: moneyTitles[p], href: p }];
    const root = Object.keys(detailLabel).find((r) => p.startsWith(r + "/"));
    return [MONEY, { label: root ? detailLabel[root] : "Money", href: p }];
  }

  // Everything else belongs to the More tab.
  if (subTitles[p]) {
    const parent = "/" + p.split("/")[1];
    return [MORE, { label: moreTitles[parent] ?? "More", href: parent }, { label: subTitles[p], href: p }];
  }
  if (moreTitles[p]) return [MORE, { label: pageTitle[p] ?? moreTitles[p], href: p }];
  const root = "/" + p.split("/")[1];
  if (moreTitles[root]) return [MORE, { label: moreTitles[root], href: root }, { label: detailLabel[root] ?? "Details", href: p }];
  return [MORE, { label: root.slice(1).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), href: p }];
}

export function TopBar() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/tv") || path.startsWith("/kid") || path === "/privacy" || path === "/terms") return null;
  const crumbs = crumbsFor(path);
  const here = crumbs[crumbs.length - 1];
  return (
    <header className="fixed top-0 inset-x-0 z-40 border-b border-line bg-bg/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <nav aria-label="Where you are" className="max-w-md mx-auto px-5 h-11 flex items-center gap-1.5 text-sm font-semibold min-w-0">
        {crumbs.map((c, i) => {
          const last = c === here;
          return (
            <span key={c.href + i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <span aria-hidden className="text-muted">›</span>}
              {last ? (
                <span aria-current="page" className="text-fg truncate font-extrabold" style={{ fontFamily: "var(--font-display)" }}>{c.label}</span>
              ) : (
                <Link href={c.href} className="text-muted hover:text-accent shrink-0">{c.label}</Link>
              )}
            </span>
          );
        })}
        <RefreshButton />
      </nav>
    </header>
  );
}
