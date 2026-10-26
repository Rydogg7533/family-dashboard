// The More hub: four sections of two-column tiles. Order here is display order (read left to right, row by row).
// Client-safe (no server imports): the "Recently opened" row reads this list in the browser.
// `wide` makes a tile span both columns (used where a section has an odd count, or to lead with one).
export type MoreGroupId = "daily" | "records" | "household" | "settings";
export type MoreGroup = { id: MoreGroupId; label: string; sec: "blue" | "teal" | "purple" | "slate"; icon: string };
export type MoreLink = { href: string; label: string; group: MoreGroupId; icon: string; wide?: boolean };

export const MORE_GROUPS: MoreGroup[] = [
  { id: "daily", label: "Daily", sec: "blue", icon: "zap" },
  { id: "records", label: "Records and money", sec: "teal", icon: "files" },
  { id: "household", label: "Household", sec: "purple", icon: "house" },
  { id: "settings", label: "Settings and system", sec: "slate", icon: "settings" },
];

export const MORE_LINKS: MoreLink[] = [
  // Daily
  { href: "/assistant", label: "Assistant", group: "daily", icon: "zap" },
  { href: "/inbox", label: "Inbox", group: "daily", icon: "inbox" },
  { href: "/money/receipts", label: "Receipts", group: "daily", icon: "receipt" },
  { href: "/day", label: "Today's schedule", group: "daily", icon: "clock" },
  { href: "/review", label: "Weekly review", group: "daily", icon: "calendarClock" },
  { href: "/calendar", label: "Calendar", group: "daily", icon: "calendar" },
  { href: "/messages", label: "Messages", group: "daily", icon: "message" },
  { href: "/mail", label: "Mail", group: "daily", icon: "mail" },
  { href: "/claims", label: "Claims", group: "daily", icon: "claims" },
  { href: "/shop", label: "Shop", group: "daily", icon: "cart" },
  { href: "/email-subscriptions", label: "Mailing lists", group: "daily", icon: "mailbox", wide: true },
  // Records and money
  { href: "/recurring", label: "Due dates and renewals", group: "records", icon: "calendarClock", wide: true },
  { href: "/money/recurring", label: "Bills and charges", group: "records", icon: "repeat" },
  { href: "/money/routine", label: "Monthly routine", group: "records", icon: "repeat" },
  { href: "/money/subscriptions", label: "Subscriptions", group: "records", icon: "creditCard" },
  { href: "/warranties", label: "Warranties", group: "records", icon: "award" },
  { href: "/things", label: "Things (inventory)", group: "records", icon: "folder" },
  { href: "/records", label: "Records", group: "records", icon: "folder" },
  // Household
  { href: "/family", label: "Family", group: "household", icon: "users" },
  { href: "/contacts", label: "Contacts", group: "household", icon: "contact" },
  { href: "/vehicles", label: "Vehicles", group: "household", icon: "car" },
  { href: "/home-property", label: "Home and property", group: "household", icon: "house" },
  { href: "/devices", label: "Devices and belongings", group: "household", icon: "laptop" },
  { href: "/places", label: "Places and activities", group: "household", icon: "mapPin" },
  { href: "/settings/sitter", label: "Sitter sheet", group: "household", icon: "users" },
  { href: "/settings/tablet", label: "Kitchen tablet", group: "household", icon: "laptop" },
  { href: "/meds", label: "Health and medications", group: "household", icon: "heartPulse" },
  { href: "/emergency", label: "Emergency plan", group: "household", icon: "siren" },
  // Settings and system
  { href: "/health", label: "System health", group: "settings", icon: "activity" },
  { href: "/settings", label: "Settings", group: "settings", icon: "settings" },
  { href: "/settings/notifications", label: "Notifications", group: "settings", icon: "bell" },
  { href: "/settings/filing-rules", label: "Filing rules", group: "settings", icon: "filter" },
  { href: "/sources", label: "Sources", group: "settings", icon: "plug" },
  { href: "/settings/modules", label: "My dashboard", group: "settings", icon: "layout" },
  { href: "/settings/preonboard", label: "Pre-onboarding links", group: "settings", icon: "list" },
  { href: "/settings/appearance", label: "Look and feel", group: "settings", icon: "palette" },
  { href: "/log", label: "Log", group: "settings", icon: "scroll" },
  { href: "/voice", label: "Phone calls", group: "settings", icon: "phone" },
  { href: "/register", label: "Source register", group: "settings", icon: "list" },
  { href: "/kid", label: "Child's page", group: "settings", icon: "baby" },
  { href: "/tv", label: "Household screen", group: "settings", icon: "tv" },
];

// The More link a path belongs to (longest matching href), or null.
export function moreLinkFor(path: string): MoreLink | null {
  let best: MoreLink | null = null;
  for (const l of MORE_LINKS) {
    if (path === l.href || path.startsWith(l.href + "/")) { if (!best || l.href.length > best.href.length) best = l; }
  }
  return best;
}
