// Slice A: client-safe types, constants and helpers (no Supabase import). data-registers.ts re-exports these.
// A short stable name for a person ("ryan"). For a real household it is made from the profile's first name (see getPeople); the database itself
// always stores the profile uuid. Sample mode uses the fixed sample people below.
export type PersonId = string;
export type Person = { id: PersonId; name: string; role: "parent" | "child"; initials: string; uuid?: string };

export type Expiry = { label: string; date: string; kind: "registration" | "insurance" | "inspection" | "emissions" | "license" | "warranty" | "other"; action: string; source: string; href: string };
export type Maintenance = { item: string; dueDate: string | null; dueMiles: number | null; lastDone: string | null };
export type DocLink = { name: string; vault: "1Password" | "Organized"; href: string };
export type Vehicle = {
  id: string; name: string; short: string; year: number; make: string; model: string; plate: string;
  driver: PersonId; mileage: number; mileageAt: string; mileageEstimated: boolean;
  expiries: Expiry[]; maintenance: Maintenance[]; documents: DocLink[];
  reminders: { item: string; lead: string }[]; links: { label: string; href: string }[]; addedBy: string;
  driverId?: string | null; details?: Record<string, unknown>; vinPointer?: string | null; mileageKnown?: boolean;
};

export type Device = {
  id: string; person: PersonId | "household"; name: string; kind: string; make: string;
  status: "in use" | "spare" | "loaned" | "retired"; serialLast4: string | null; serialPointer: string | null;
  warrantyEnd: string | null; planName: string | null; planEnd: string | null; subscription: string | null; note: string | null;
  openIn: { label: string; href: string }; addedBy: string;
};

export type Medication = {
  id: string; person: PersonId; name: string; strength: string; dose: string; times: string[];
  doctor: string; pharmacy: string; pharmacyHref: string; refillsRemaining: number; refillDue: string;
  reminders: boolean; instructions: string | null; prescriptionPointer: string; addedBy: string;
};

export type Contact = { id: string; name: string; kind: string; reach: string; registers: string[]; notes: string | null; openIn: { label: string; href: string }; addedBy: string };
export type HomeItem = { id: string; name: string; system: string; installed: string | null; lastService: string | null; nextDue: string | null; company: string | null; openIn: { label: string; href: string }; addedBy: string };
export type Place = { id: string; person: PersonId; name: string; meaning: string; indoors: boolean; usualActivity: string; visits: number; addedBy: string };
export type Source = {
  id: string; addedBy: string; group: "Calendar and schedule" | "Email" | "Money" | "Family, home and system";
  name: string; account: string; reads: string; lastSynced: string; status: "ok" | "warn" | "error";
  cadence: string | null; href: string; syncable: boolean;
};
export type EmergencySection = { title: string; items: { name: string; pointer: string; lastReviewed: string }[] };
export type ScheduleBlock = { time: string; title: string; place: string; who?: string };
export type Activity = { name: string; season: string; checklist: string[]; responsible: PersonId };
export type OpenItem = { id: string; kind: "reply" | "do" | "decide"; title: string; due: string | null; who: string };

// ---- helpers ----
const DAY = 86_400_000;
export const dIso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * DAY).toISOString().slice(0, 10);
export function daysUntil(iso: string | null) { if (!iso) return null; return Math.round((new Date(iso + "T12:00:00").getTime() - Date.now()) / DAY); }
export function dueState(iso: string | null, warnDays = 30): "ok" | "warn" | "error" | "unknown" {
  const d = daysUntil(iso); if (d == null) return "unknown"; if (d < 0) return "error"; if (d <= warnDays) return "warn"; return "ok";
}
export function dueText(iso: string | null) {
  const d = daysUntil(iso); if (d == null) return "no date";
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`; if (d === 0) return "due today"; if (d === 1) return "due tomorrow"; return `in ${d} days`;
}
export function fmtDate(iso: string | null) { if (!iso) return "—"; return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

// ---- sample data ----
export const PEOPLE: Person[] = [
  { id: "ryan", name: "Ryan", role: "parent", initials: "R" },
  { id: "melissa", name: "Melissa", role: "parent", initials: "M" },
  { id: "child1", name: "[Child 1]", role: "child", initials: "C1" },
  { id: "child2", name: "[Child 2]", role: "child", initials: "C2" },
];
// The household's people as last read from the database (set by getPeople on the server, before pages render). Single-tenant app: one household per deployment.
let roster: Person[] = PEOPLE;
export const setRoster = (people: Person[]) => { roster = people.length ? people : PEOPLE; };
export const personName = (id: PersonId | "household") => id === "household" ? "Household" : roster.find((p) => p.id === id)?.name ?? PEOPLE.find((p) => p.id === id)?.name ?? id;

