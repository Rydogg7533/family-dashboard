// Things a receipt can belong to. Free to extend: a subject of any kind is created the first time it is used,
// and the filing agent writes one index page per subject (see scripts/filing-agent.mjs).
export const SUBJECT_KINDS = [
  { kind: "vehicle", label: "Vehicle" },
  { kind: "home", label: "Home / property" },
  { kind: "appliance", label: "Appliance / electronics" },
  { kind: "person", label: "Person" },
  { kind: "pet", label: "Pet" },
  { kind: "business", label: "Business" },
  { kind: "trip", label: "Trip / event" },
  { kind: "project", label: "Project" },
  { kind: "gift", label: "Gift" },
  { kind: "other", label: "Other" },
] as const;
export type Subject = { id: string; kind: string; name: string };
