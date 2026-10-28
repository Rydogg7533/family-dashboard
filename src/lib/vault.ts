// Pointers into 1Password (0069). Shared between the Settings page, the Ask tool and the Notion checklist:
// the groups and their labels are the same everywhere so a person hears the same words in all three.
export const VAULT_GROUPS = [
  { id: "identity", label: "Identity", blurb: "Passport, driver license, Social Security, birth and marriage certificates" },
  { id: "vehicles", label: "Vehicles", blurb: "Titles, registrations, auto insurance cards, loan, VIN" },
  { id: "home", label: "Home and property", blurb: "Deed, mortgage, homeowners policy, HOA, alarm codes, utility accounts" },
  { id: "health", label: "Health", blurb: "Insurance cards, HSA, prescriptions, vaccination records" },
  { id: "money", label: "Money", blurb: "Account numbers, tax returns, CPA, crypto recovery" },
  { id: "business", label: "Business", blurb: "EIN letters, formation documents, domains, business insurance" },
  { id: "estate", label: "Estate", blurb: "Will, trust, powers of attorney, beneficiaries, life insurance, where the originals are" },
  { id: "devices", label: "Devices", blurb: "Serials, Apple IDs, the Mac mini's FileVault recovery key" },
  { id: "other", label: "Other", blurb: "Anything else" },
] as const;
export type VaultGroup = (typeof VAULT_GROUPS)[number]["id"];
export const VAULT_GROUP_IDS = VAULT_GROUPS.map((g) => g.id) as readonly string[];
export const groupLabel = (id: string) => VAULT_GROUPS.find((g) => g.id === id)?.label ?? id;

export const ITEM_TYPES = ["passport", "driver_license", "ssn", "identity", "document", "bank_account", "secure_note", "membership", "software_license", "other"] as const;
export const typeLabel = (t: string | null) => (t ? t.replace(/_/g, " ") : "");

export type VaultPointer = {
  id: string; person: string | null; group: VaultGroup; label: string; item_type: string | null; link: string | null;
  expires_on: string | null; attached_kind: string | null; attached_id: string | null; note: string | null; updated_at: string;
};

export type VaultOwner = { id: string; name: string };

// Which person's section a pointer belongs to on Settings › 1Password. Mirrors the 1Password vaults: one per
// adult, one per child, one Shared. Adult items carry the adult's id in `person`. Child and household items
// both have person = null, so a child's item is recognised by its label starting with the child's name
// ("Audrey passport"); everything else null is Shared. No schema change.
export function ownerKey(r: Pick<VaultPointer, "person" | "label">, adults: VaultOwner[], kids: VaultOwner[]): string {
  if (r.person) return adults.some((a) => a.id === r.person) ? `a:${r.person}` : "other";
  const label = r.label.toLowerCase();
  const kid = kids.find((k) => new RegExp(`^${k.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|['’]s\\b)`).test(label));
  return kid ? `k:${kid.id}` : "shared";
}

// A 1Password private link, or the app scheme. Anything else is refused so the Open button can be trusted.
export const isVaultLink = (s: string) => /^https:\/\/start\.1password\.com\/open\//i.test(s) || /^onepassword:\/\//i.test(s) || /^https:\/\/[a-z0-9-]+\.1password\.com\//i.test(s);

// What a pointer can be (D19, 2026-10-28): a fixed list, one per kind of thing, so a person never types a free name,
// picks a group by hand or puts a date in the note. Each kind knows its group, its 1Password type, who or what it is
// about, and whether it expires (then the date is required). The label is built from the kind and the subject.
export type About = "me" | "household" | "child" | "vehicle" | "entity" | "account" | "device";
export type VaultKind = { id: string; label: string; group: VaultGroup; type: string; about: About[]; expires: boolean; shared?: boolean };
export const VAULT_KINDS: VaultKind[] = [
  { id: "passport", label: "passport", group: "identity", type: "passport", about: ["me", "child"], expires: true },
  { id: "license", label: "driver license", group: "identity", type: "driver_license", about: ["me", "child"], expires: true },
  { id: "ssn", label: "Social Security card", group: "identity", type: "ssn", about: ["me", "child"], expires: false },
  { id: "birth", label: "birth certificate", group: "identity", type: "document", about: ["me", "child"], expires: false },
  { id: "traveler", label: "known traveler number", group: "identity", type: "membership", about: ["me", "child"], expires: true },
  { id: "marriage", label: "Marriage certificate", group: "identity", type: "document", about: ["household"], expires: false },
  { id: "title", label: "title", group: "vehicles", type: "document", about: ["vehicle"], expires: false },
  { id: "registration", label: "registration", group: "vehicles", type: "document", about: ["vehicle"], expires: true },
  { id: "auto_card", label: "insurance card", group: "vehicles", type: "document", about: ["vehicle"], expires: true },
  { id: "vin", label: "VIN", group: "vehicles", type: "secure_note", about: ["vehicle"], expires: false },
  { id: "vehicle_loan", label: "loan account", group: "vehicles", type: "bank_account", about: ["vehicle"], expires: false },
  { id: "auto_policy", label: "Auto insurance policy", group: "vehicles", type: "document", about: ["household"], expires: true },
  { id: "deed", label: "Deed and closing documents", group: "home", type: "document", about: ["household"], expires: false },
  { id: "mortgage", label: "Mortgage account", group: "home", type: "bank_account", about: ["household"], expires: false },
  { id: "home_insurance", label: "Homeowners policy", group: "home", type: "document", about: ["household"], expires: true },
  { id: "hoa", label: "HOA account", group: "home", type: "membership", about: ["household"], expires: false },
  { id: "alarm", label: "Alarm and security codes", group: "home", type: "secure_note", about: ["me"], expires: false },
  { id: "utility", label: "utility account", group: "home", type: "secure_note", about: ["household"], expires: false },
  { id: "health_card", label: "health insurance card", group: "health", type: "document", about: ["me", "child"], expires: true },
  { id: "dental_card", label: "dental and vision cards", group: "health", type: "document", about: ["me", "child"], expires: true },
  { id: "hsa", label: "HSA / FSA account", group: "health", type: "bank_account", about: ["me"], expires: false },
  { id: "rx", label: "prescription numbers", group: "health", type: "secure_note", about: ["me", "child"], expires: false },
  { id: "vaccines", label: "immunization record", group: "health", type: "document", about: ["me", "child"], expires: false },
  { id: "account", label: "account number", group: "money", type: "bank_account", about: ["account"], expires: false },
  { id: "taxes", label: "Tax returns", group: "money", type: "document", about: ["me"], expires: false },
  { id: "cpa", label: "CPA portal", group: "money", type: "secure_note", about: ["me"], expires: false },
  { id: "crypto", label: "Crypto recovery phrases", group: "money", type: "secure_note", about: ["me"], expires: false },
  { id: "ein", label: "EIN letter", group: "business", type: "document", about: ["entity"], expires: false },
  { id: "formation", label: "formation documents", group: "business", type: "document", about: ["entity"], expires: false },
  { id: "domains", label: "Domain registrar and DNS", group: "business", type: "secure_note", about: ["me"], expires: true },
  { id: "biz_insurance", label: "business insurance", group: "business", type: "document", about: ["entity"], expires: true },
  { id: "will", label: "will and trust", group: "estate", type: "document", about: ["me", "household"], expires: false },
  { id: "poa", label: "powers of attorney", group: "estate", type: "document", about: ["me"], expires: false },
  { id: "beneficiaries", label: "beneficiary designations", group: "estate", type: "secure_note", about: ["me"], expires: false },
  { id: "life_insurance", label: "life insurance policy", group: "estate", type: "document", about: ["me"], expires: true },
  { id: "originals", label: "Where the originals are kept", group: "estate", type: "secure_note", about: ["household"], expires: false },
  { id: "serial", label: "serial number and receipt", group: "devices", type: "secure_note", about: ["device"], expires: false },
  { id: "filevault", label: "Mac mini FileVault recovery key", group: "devices", type: "secure_note", about: ["me"], expires: false },
  { id: "other", label: "other", group: "other", type: "document", about: ["me", "household", "child", "vehicle", "entity"], expires: false },
];
export const kindById = (id: string) => VAULT_KINDS.find((k) => k.id === id) ?? null;
// "Audrey passport", "Sienna registration", "Marriage certificate": the label is the subject plus the kind, except for
// household-wide kinds, which are a fixed name.
export const buildLabel = (kind: VaultKind, subject: string | null) => (subject ? `${subject} ${kind.label}` : kind.label[0].toUpperCase() + kind.label.slice(1));
// Duplicates are matched on this: lower case, straight quotes, "'s" dropped, parentheses dropped, spaces squeezed.
export const labelKey = (l: string) => l.toLowerCase().replace(/[’']s\b/g, "").replace(/\s*\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
