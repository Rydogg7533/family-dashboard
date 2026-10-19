export type MoreLink = { href: string; label: string; note?: string; group: "Daily" | "Reference" | "Settings and Info" };
export const MORE_LINKS: MoreLink[] = [
  // core
  { href: "/log", label: "Log", note: "What was handled quietly", group: "Reference" },
  { href: "/health", label: "System health", group: "Settings and Info" },
  { href: "/register", label: "Source register", group: "Settings and Info" },
  // slice A (settings, people, registers) — append below
  // slice B (email, inbox, money) — append below
  // slice C (day, calendar, messages, shop, household) — append below
  { href: "/day", label: "Today's schedule", note: "Blocks, weather, checklists, questions", group: "Daily" },
  { href: "/calendar", label: "Calendar", note: "Week and agenda, weather on every event", group: "Daily" },
  { href: "/messages", label: "Messages", note: "Your own threads, plus the assistant", group: "Daily" },
  { href: "/shop", label: "Shop", note: "Find, cart, orders, cases", group: "Daily" },
  { href: "/recurring", label: "Recurring and renewals", group: "Reference" },
  { href: "/voice", label: "Phone calls", note: "Voice agent, approvals", group: "Reference" },
  { href: "/kid", label: "Child's page", note: "What a child sees", group: "Settings and Info" },
  { href: "/tv", label: "Household screen", note: "Family room TV view", group: "Settings and Info" },
];
