// Sitter nights: client-safe types and constants (no Supabase import).
export type SectionId = "contacts" | "kids" | "where" | "house" | "rules" | "health" | "pets";
export const SECTIONS: { id: SectionId; title: string; hint: string; canSkip: boolean }[] = [
  { id: "contacts", title: "Emergency and contacts", hint: "Your phone numbers, a neighbor or relative, poison control (1-800-222-1222), and the house address for 911.", canSkip: false },
  { id: "kids", title: "The kids", hint: "Names, ages, bedtimes, routines, dinner and snacks, screen-time rules.", canSkip: true },
  { id: "where", title: "Where things are", hint: "First-aid kit, pajamas, night-lights, the remote. Link a Things item to show its photo.", canSkip: true },
  { id: "house", title: "House notes", hint: "How the TV works, the thermostat, which doors lock. Do not put door codes or passwords here.", canSkip: true },
  { id: "rules", title: "Rules", hint: "What is off limits, who may come to the door, when to call you.", canSkip: true },
  { id: "health", title: "Allergies and medicine", hint: "Off by default. You choose each visit whether it shows on the tablet.", canSkip: true },
  { id: "pets", title: "Pets", hint: "Name, feeding, where they sleep, do not let out.", canSkip: true },
];
// The always-on household card (migration 0076): kids and health moved to per-child templates.
export const HOUSEHOLD_SECTIONS = SECTIONS.filter((s) => s.id !== "kids" && s.id !== "health");

// Templates (migration 0076). Sections are plain strings on the row; these lists give the editor its order and hints.
export type TemplateKind = "general" | "child";
export type TSection = { id: string; title: string; hint: string; health?: boolean };
export const GENERAL_SECTIONS: TSection[] = [
  { id: "arrival", title: "Arrival", hint: "What to do first: shoes, where to put a bag, what the kids are usually doing." },
  { id: "shape", title: "The evening's shape", hint: "A few lines in order: dinner, play, wind-down, lights out. Times can change per visit." },
  { id: "food", title: "Food", hint: "What the sitter may serve, what is off limits, what is theirs to eat." },
  { id: "screens", title: "Screens and devices", hint: "What is allowed, how long, which remote." },
  { id: "outside", title: "Outside and visitors", hint: "Yard, front door, friends over, driving the kids." },
  { id: "house", title: "House notes", hint: "Thermostat, lights, trash night, the alarm described without codes." },
  { id: "if", title: "If something happens", hint: "Who to call in what order, what to write down." },
  { id: "leaving", title: "Before you leave", hint: "Tidy level, lock-up, leave a note on the tablet." },
  { id: "pay", title: "Pay", hint: "Rate and how you pay. Shown on the sheet only when you tick it for a visit." },
];
export const CHILD_SECTIONS: TSection[] = [
  { id: "now", title: "Right now", hint: "One line the sitter reads first." },
  { id: "bedtime", title: "Bedtime and routine", hint: "Steps in order with times; what done looks like; what to do if they stall." },
  { id: "food", title: "Food", hint: "Likes, dislikes, allowed snacks, what they will claim they are allowed." },
  { id: "comfort", title: "Comfort and calming", hint: "What helps when upset, what makes it worse, comfort items and where they are." },
  { id: "screens", title: "Screens and homework", hint: "Own-device rules; the standing rule, not tonight's homework." },
  { id: "never", title: "Never", hint: "Three to five hard lines." },
  { id: "health", title: "Allergies and medicine", hint: "Stored here, off by default; shown only when you tick it for a visit.", health: true },
  { id: "little", title: "Little kids", hint: "Diapers or potty, nap, car seat, bath, their words for things." },
  { id: "teen", title: "Teens", hint: "Curfew, friends allowed, driving rule." },
];
export const templateSections = (kind: TemplateKind) => (kind === "general" ? GENERAL_SECTIONS : CHILD_SECTIONS);
export type SitterTemplate = { id: string; kind: TemplateKind; childId: string | null; childName: string | null; name: string; isDefault: boolean; sort: number; itemCount: number; updatedAt: string };
export type TemplateLine = { id: string; templateId: string; section: string; text: string; thingItemId: string | null; thingName: string | null; photo: string | null; defaultOn: boolean; health: boolean };

// Approved sitters: name and phone come from the address book card; this row holds only sitter notes and the approval.
export type SitterPerson = {
  id: string; contactId: string | null; pendingEditId: string | null; name: string; phone: string | null; cardMine: boolean; pending: boolean;
  relationship: string | null; ageBand: "adult" | "teen" | null; age: number | null; rateText: string | null; drives: boolean | null; childrenOk: string[] | null;
  availabilityText: string | null; guardianContactId: string | null; guardianName: string | null; certifiedText: string | null; notes: string | null;
  approvedAt: string | null; suggestedBy: string | null; lastVisitAt: string | null; finishTaskId: string | null; missing: string[];
};
export const SITTER_FIELDS: { key: keyof SitterPerson; label: string }[] = [
  { key: "relationship", label: "how you know them" }, { key: "ageBand", label: "adult or teen" }, { key: "rateText", label: "rate" }, { key: "drives", label: "drives" },
  { key: "availabilityText", label: "availability" }, { key: "notes", label: "notes" },
];
export const missingFields = (p: Pick<SitterPerson, "relationship" | "ageBand" | "rateText" | "drives" | "availabilityText" | "notes" | "phone">) => {
  const m: string[] = []; if (!p.phone) m.push("phone");
  for (const f of SITTER_FIELDS) if (p[f.key as keyof typeof p] == null || p[f.key as keyof typeof p] === "") m.push(f.label);
  return m;
};
export const sectionTitle = (id: string) => SECTIONS.find((s) => s.id === id)?.title ?? id;

export type TemplateItem = { id: string; section: SectionId; text: string; thingItemId: string | null; thingName: string | null; photo: string | null; defaultOn: boolean };
// section is a household section id, "g:<section>" for a general-template line, or "c:<childId>:<section>" for a child's line.
// label is the heading the person and the tablet see; items keep the order the compiler gave them.
export type SheetItem = { id: string; section: string; text: string; photo: string | null; on: boolean; label?: string; health?: boolean };
export const sheetLabel = (i: Pick<SheetItem, "section" | "label">) => i.label ?? sectionTitle(i.section);
// Group a sheet by section, keeping first-seen order.
export function groupSheet(items: SheetItem[]) {
  const out: { section: string; label: string; health: boolean; items: SheetItem[] }[] = [];
  for (const i of items) {
    let g = out.find((x) => x.section === i.section);
    if (!g) { g = { section: i.section, label: sheetLabel(i), health: !!i.health || i.section === "health" || /:health$/.test(i.section), items: [] }; out.push(g); }
    g.items.push(i);
  }
  return out;
}
export type NightStatus = "needed" | "proposed" | "scheduled" | "awaiting_review" | "confirmed" | "ended" | "declined" | "cancelled";
export type Night = {
  id: string; eventKey: string | null; title: string; place: string | null; sitterName: string | null; startsAt: string; leaveAt: string; endsAt: string;
  source: "marked" | "detected" | "told"; status: NightStatus; promptTo: string | null; confirmedAt: string | null; sheet: SheetItem[]; note: string | null; visitOnly: string | null;
  sitterPersonId: string | null; generalTemplateId: string | null; childTemplates: Record<string, string>; childrenHome: string[] | null; lines: string[]; instructionsMode: "template" | "custom" | "blank" | null; preparedAt: string | null;
};

// Health items are never on by default, whatever the template says: the parent turns them on for a visit.
export const startsOn = (section: string, defaultOn: boolean) => section !== "health" && !/:health$/.test(section) && defaultOn;

export const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
