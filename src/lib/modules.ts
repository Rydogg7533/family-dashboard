// F13 modules: fixed frame + optional modules per person. Stored in localStorage (profile row later).
export type ModuleDef = { id: string; label: string; note: string; tier: "fixed" | "on" | "off"; href?: string };

export const MODULES: ModuleDef[] = [
  { id: "today", label: "Today", note: "Needs me, the schedule block, system health", tier: "fixed", href: "/" },
  { id: "ask", label: "Ask", note: "The question box on every page", tier: "fixed", href: "/ask" },
  { id: "tasks", label: "Tasks", note: "The one action queue", tier: "fixed", href: "/tasks" },
  { id: "settings", label: "Settings and Info", note: "Status, Contacts, Log, Emergency plan, Data and privacy", tier: "fixed", href: "/settings" },
  { id: "capture", label: "+ capture", note: "Camera, upload, bulk drop", tier: "fixed" },
  { id: "safety", label: "Safety notifications", note: "Failed backup, security sign-in, severe weather, lost device", tier: "fixed" },

  { id: "money", label: "Money and receipts", note: "Default on for parents", tier: "on", href: "/money" },
  { id: "calendar", label: "Calendar and Day record", note: "Location sharing is a separate switch", tier: "on", href: "/calendar" },
  { id: "weather", label: "Weather", note: "On schedule blocks and future events", tier: "on" },
  { id: "checklists", label: "Checklists", note: "What to take, learned over time", tier: "on" },
  { id: "family", label: "Family pages", note: "People and dates, school and activities, Health (private)", tier: "on", href: "/family" },
  { id: "vehicles", label: "Vehicles", note: "On for the driver; visible to the other parent", tier: "on", href: "/vehicles" },
  { id: "email", label: "Email handling", note: "Per connected account", tier: "on", href: "/inbox" },
  { id: "inbox", label: "Inbox (filing items)", note: "On for parents", tier: "on", href: "/inbox" },
  { id: "recurring", label: "Recurring (subscriptions)", note: "On for parents", tier: "on", href: "/recurring" },
  { id: "documents", label: "Documents finder", note: "On for parents", tier: "on", href: "/documents" },
  { id: "review", label: "Weekly review", note: "Goals part optional", tier: "on" },

  { id: "devices", label: "Devices and belongings", note: "Beyond the Family-page short list", tier: "off", href: "/devices" },
  { id: "home", label: "Home and property", note: "Register under Info; surfaces when due", tier: "off", href: "/home-property" },
  { id: "trips", label: "Trips", note: "A trip card still appears when the calendar has one", tier: "off" },
  { id: "meals", label: "Meals and groceries", note: "Small section on Today", tier: "off" },
  { id: "work", label: "Work area", note: "Business pages; off until a parent turns them on", tier: "off", href: "/work" },
  { id: "voice", label: "Voice and the car", note: "Later; depends on the phone app route", tier: "off" },
  { id: "kids", label: "Children's own logins", note: "Created by a parent", tier: "off" },
  { id: "applehealth", label: "Apple Health connection", note: "Off per person", tier: "off" },
];

export const MODULE_PRESETS: Record<string, string[]> = {
  "Parent": MODULES.filter((m) => m.tier === "on").map((m) => m.id),
  "Parent + Work": [...MODULES.filter((m) => m.tier === "on").map((m) => m.id), "work", "devices"],
  "Child": ["calendar", "weather", "checklists", "family"],
  "Minimal": ["calendar", "family"],
};

export const MODULES_KEY = "fd.modules.v1";
export type ModulesState = { on: string[]; preset?: string; updatedAt?: string };
export const RECOMMENDED: ModulesState = { on: MODULE_PRESETS["Parent"], preset: "Parent" };

export function loadModules(): ModulesState {
  try { const raw = localStorage.getItem(MODULES_KEY); if (raw) return JSON.parse(raw); } catch {}
  return RECOMMENDED;
}
export function saveModules(s: ModulesState) { try { localStorage.setItem(MODULES_KEY, JSON.stringify({ ...s, updatedAt: new Date().toISOString() })); } catch {} }
