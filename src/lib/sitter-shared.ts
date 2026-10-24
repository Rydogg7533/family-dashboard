// Sitter nights: client-safe types and constants (no Supabase import).
export type SectionId = "contacts" | "kids" | "where" | "house" | "rules" | "health";
export const SECTIONS: { id: SectionId; title: string; hint: string; canSkip: boolean }[] = [
  { id: "contacts", title: "Emergency and contacts", hint: "Your phone numbers, a neighbor or relative, poison control (1-800-222-1222), and the house address for 911.", canSkip: false },
  { id: "kids", title: "The kids", hint: "Names, ages, bedtimes, routines, dinner and snacks, screen-time rules.", canSkip: true },
  { id: "where", title: "Where things are", hint: "First-aid kit, pajamas, night-lights, the remote. Link a Things item to show its photo.", canSkip: true },
  { id: "house", title: "House notes", hint: "How the TV works, the thermostat, which doors lock. Do not put door codes or passwords here.", canSkip: true },
  { id: "rules", title: "Rules", hint: "What is off limits, who may come to the door, when to call you.", canSkip: true },
  { id: "health", title: "Allergies and medicine", hint: "Off by default. You choose each visit whether it shows on the tablet.", canSkip: true },
];
export const sectionTitle = (id: string) => SECTIONS.find((s) => s.id === id)?.title ?? id;

export type TemplateItem = { id: string; section: SectionId; text: string; thingItemId: string | null; thingName: string | null; photo: string | null; defaultOn: boolean };
export type SheetItem = { id: string; section: SectionId; text: string; photo: string | null; on: boolean };
export type NightStatus = "proposed" | "scheduled" | "awaiting_review" | "confirmed" | "ended" | "declined" | "cancelled";
export type Night = {
  id: string; eventKey: string | null; title: string; place: string | null; sitterName: string | null; startsAt: string; leaveAt: string; endsAt: string;
  source: "marked" | "detected" | "told"; status: NightStatus; promptTo: string | null; confirmedAt: string | null; sheet: SheetItem[]; note: string | null; visitOnly: string | null;
};

// Health items are never on by default, whatever the template says: the parent turns them on for a visit.
export const startsOn = (section: SectionId, defaultOn: boolean) => section !== "health" && defaultOn;

export const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
