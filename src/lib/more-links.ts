export type MoreLink = { href: string; label: string; note?: string; group: "Daily" | "Reference" | "Settings and Info" };
export const MORE_LINKS: MoreLink[] = [
  // core
  { href: "/log", label: "Log", note: "What was handled quietly", group: "Reference" },
  { href: "/health", label: "System health", group: "Settings and Info" },
  { href: "/register", label: "Source register", group: "Settings and Info" },
  // slice A (settings, people, registers) — append below
  // slice B (email, inbox, money) — append below
  // slice C (day, calendar, messages, shop, household) — append below
];
