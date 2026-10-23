export type MoreLink = { href: string; label: string; note?: string; group: "Daily" | "Reference" | "Settings and Info" };
export const MORE_LINKS: MoreLink[] = [
  // core
  { href: "/log", label: "Log", note: "What was handled quietly", group: "Reference" },
  { href: "/health", label: "System health", note: "Status and your problem reports", group: "Settings and Info" },
  { href: "/register", label: "Source register", group: "Settings and Info" },
  // slice A (settings, people, registers) — append below
  { href: "/family", label: "Family", note: "One page per person", group: "Reference" },
  { href: "/vehicles", label: "Vehicles", note: "Tahoe, Sienna", group: "Reference" },
  { href: "/meds", label: "Health and medications", note: "Private per person", group: "Reference" },
  { href: "/devices", label: "Devices and belongings", group: "Reference" },
  { href: "/home-property", label: "Home and property", group: "Reference" },
  { href: "/contacts", label: "Contacts", group: "Reference" },
  { href: "/places", label: "Places and activities", group: "Reference" },
  { href: "/settings", label: "Settings and Info", note: "People, connections, filing, privacy", group: "Settings and Info" },
  { href: "/settings/appearance", label: "Look and feel", group: "Settings and Info" },
  { href: "/settings/modules", label: "My dashboard", note: "Modules on or off", group: "Settings and Info" },
  { href: "/settings/filing-rules", label: "Filing rules", note: "Vendor → folder rules you made", group: "Settings and Info" },
  { href: "/settings/notifications", label: "Notifications", note: "Where each kind appears", group: "Settings and Info" },
  { href: "/sources", label: "Sources", note: "Go and Sync now for every source", group: "Settings and Info" },
  { href: "/emergency", label: "Emergency plan", note: "Parents only", group: "Settings and Info" },
  // slice B (email, inbox, money) — append below
  { href: "/inbox", label: "Inbox", note: "Identify, file, decide", group: "Daily" },
  { href: "/money/receipts", label: "Receipts", note: "Camera, upload, matching", group: "Daily" },
  { href: "/claims", label: "Claims", note: "Reimbursements and warranty claims", group: "Daily" },
  { href: "/records", label: "Records", note: "Confirmations, tickets, claims", group: "Reference" },
  { href: "/money/recurring", label: "Recurring", note: "Bills and subscriptions register", group: "Reference" },
  { href: "/money/subscriptions", label: "Subscriptions", note: "Keep, cancel, acknowledge", group: "Reference" },
  // slice C (day, calendar, messages, shop, household) — append below
  { href: "/day", label: "Today's schedule", note: "Blocks, weather, checklists, questions", group: "Daily" },
  { href: "/calendar", label: "Calendar", note: "Week and agenda, weather on every event", group: "Daily" },
  { href: "/messages", label: "Messages", note: "Your own threads, plus the assistant", group: "Daily" },
  { href: "/shop", label: "Shop", note: "Find, cart, orders, cases", group: "Daily" },
  { href: "/recurring", label: "Recurring and renewals", group: "Reference" },
  { href: "/voice", label: "Phone calls", note: "Voice agent, approvals", group: "Reference" },
  { href: "/kid", label: "Child's page", note: "What a child sees", group: "Settings and Info" },
  { href: "/tv", label: "Household screen", note: "Family room TV view", group: "Settings and Info" },
  // email subscriptions (mailing lists found in the mailbox) — append below
  { href: "/mail", label: "Mail", note: "Inbox and drafts", group: "Daily" },
  { href: "/email-subscriptions", label: "Email subscriptions", note: "Tick lists to unsubscribe", group: "Daily" },
];
