// The master checklist of sensitive items a household keeps in 1Password (D116). What was built by hand on
// 2026-10-26 (claude/stewardos-decisions-log-2026-10-26s.md), written down once so any household gets the
// same list for its own people, vehicles and businesses with one tap. `for` says who or what each item
// applies to; the generator expands it against the household and never makes an item that already exists.
import type { VaultGroup } from "@/lib/vault";

export type Applies = "adult" | "child" | "household" | "vehicle" | "entity" | "head" | "account" | "device";
export type TemplateItem = {
  key: string;                 // stable id; "{name}" in label is filled per person, vehicle or entity
  group: VaultGroup;
  label: string;
  for: Applies;
  type: string;                // 1Password item type
  vault: "private" | "shared"; // where it belongs in 1Password
  scan: boolean;               // attach a scan
  priority: 1 | 2 | 3;         // 1 first, 2 soon, 3 later
  note?: string;
  adultChildNote?: boolean;    // for a child who is an adult: "only if she wants the family to hold a copy"
};

export const VAULT_TEMPLATE: TemplateItem[] = [
  // D19 (Ryan, 2026-10-28): one item per thing, never a grouped note. Every {name} is one person, vehicle, account, device or
  // business, so the system can see each one on its own, remind on its own date, and attach it to the thing it is about.
  // Identity
  { key: "passport", group: "identity", label: "{name} passport", for: "adult", type: "passport", vault: "private", scan: true, priority: 1, note: "Add the expiry date; it reminds 90 days out" },
  { key: "passport", group: "identity", label: "{name} passport", for: "child", type: "passport", vault: "shared", scan: true, priority: 2, note: "Shared vault, held by parents", adultChildNote: true },
  { key: "license", group: "identity", label: "{name} driver license", for: "adult", type: "driver_license", vault: "private", scan: true, priority: 1, note: "Add the expiry date" },
  { key: "ssn", group: "identity", label: "{name} Social Security card", for: "adult", type: "ssn", vault: "private", scan: true, priority: 1 },
  { key: "ssn", group: "identity", label: "{name} Social Security card", for: "child", type: "ssn", vault: "shared", scan: true, priority: 1, note: "Shared vault", adultChildNote: true },
  { key: "birth", group: "identity", label: "{name} birth certificate", for: "adult", type: "document", vault: "private", scan: true, priority: 2 },
  { key: "birth", group: "identity", label: "{name} birth certificate", for: "child", type: "document", vault: "shared", scan: true, priority: 2, note: "Shared vault", adultChildNote: true },
  { key: "marriage", group: "identity", label: "Marriage certificate", for: "household", type: "document", vault: "shared", scan: true, priority: 3 },
  // Vehicles: one of each per vehicle
  { key: "title", group: "vehicles", label: "{name} title", for: "vehicle", type: "document", vault: "shared", scan: true, priority: 2, note: "Also: the vehicle › Where the title is kept" },
  { key: "registration", group: "vehicles", label: "{name} registration", for: "vehicle", type: "document", vault: "shared", scan: true, priority: 1, note: "Add the expiry date; it goes on the vehicle too" },
  { key: "auto_card", group: "vehicles", label: "{name} insurance card", for: "vehicle", type: "document", vault: "shared", scan: true, priority: 1, note: "Add the renewal date" },
  { key: "vin", group: "vehicles", label: "{name} VIN", for: "vehicle", type: "secure_note", vault: "shared", scan: false, priority: 2, note: "The app keeps only this pointer" },
  { key: "auto_policy", group: "vehicles", label: "Auto insurance policy", for: "household", type: "document", vault: "shared", scan: true, priority: 1, note: "The policy itself; each vehicle has its own card" },
  // Home
  { key: "deed", group: "home", label: "Deed and closing documents", for: "household", type: "document", vault: "shared", scan: true, priority: 2 },
  { key: "mortgage", group: "home", label: "Mortgage account", for: "household", type: "bank_account", vault: "shared", scan: false, priority: 2 },
  { key: "home_insurance", group: "home", label: "Homeowners policy", for: "household", type: "document", vault: "shared", scan: true, priority: 1, note: "Add the renewal date" },
  { key: "alarm", group: "home", label: "Alarm and security codes", for: "head", type: "secure_note", vault: "private", scan: false, priority: 1, note: "Never in the app; Ask only opens it" },
  { key: "utility", group: "home", label: "Power utility account", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 3 },
  { key: "utility", group: "home", label: "Gas utility account", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 3 },
  { key: "utility", group: "home", label: "Water utility account", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 3 },
  { key: "utility", group: "home", label: "Internet account", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 3 },
  // Health: one card per person
  { key: "health_card", group: "health", label: "{name} health insurance card", for: "adult", type: "document", vault: "private", scan: true, priority: 1, note: "Add the plan year end" },
  { key: "health_card", group: "health", label: "{name} health insurance card", for: "child", type: "document", vault: "shared", scan: true, priority: 1 },
  { key: "dental_card", group: "health", label: "{name} dental and vision cards", for: "adult", type: "document", vault: "private", scan: true, priority: 2 },
  { key: "dental_card", group: "health", label: "{name} dental and vision cards", for: "child", type: "document", vault: "shared", scan: true, priority: 2 },
  { key: "hsa", group: "health", label: "HSA / FSA account", for: "head", type: "bank_account", vault: "private", scan: false, priority: 2 },
  { key: "rx", group: "health", label: "{name} prescription numbers", for: "adult", type: "secure_note", vault: "private", scan: false, priority: 3, note: "Also: each medication › Prescription" },
  { key: "vaccines", group: "health", label: "{name} immunization record", for: "adult", type: "document", vault: "private", scan: true, priority: 3 },
  { key: "vaccines", group: "health", label: "{name} immunization record", for: "child", type: "document", vault: "shared", scan: true, priority: 2 },
  // Money: one per account (from the Accounts register)
  { key: "account", group: "money", label: "{name} account number", for: "account", type: "bank_account", vault: "private", scan: false, priority: 1, note: "The login goes in Apple Passwords" },
  { key: "taxes", group: "money", label: "Tax returns", for: "head", type: "document", vault: "private", scan: false, priority: 2, note: "Files live in Organized/Personal/Documents/Finance/Taxes" },
  { key: "cpa", group: "money", label: "CPA portal", for: "head", type: "secure_note", vault: "private", scan: false, priority: 3 },
  { key: "crypto", group: "money", label: "Crypto recovery phrases", for: "head", type: "secure_note", vault: "private", scan: false, priority: 1, note: "Nowhere else, ever; Ask only opens it" },
  // Business: one of each per entity
  { key: "ein", group: "business", label: "{name} EIN letter", for: "entity", type: "document", vault: "private", scan: true, priority: 2 },
  { key: "formation", group: "business", label: "{name} formation documents", for: "entity", type: "document", vault: "private", scan: false, priority: 3 },
  { key: "domains", group: "business", label: "Domain registrar and DNS", for: "head", type: "secure_note", vault: "private", scan: false, priority: 2 },
  // Estate: one per adult where it is personal
  { key: "will", group: "estate", label: "{name} will and trust", for: "adult", type: "document", vault: "private", scan: true, priority: 2 },
  { key: "poa", group: "estate", label: "{name} powers of attorney", for: "adult", type: "document", vault: "private", scan: true, priority: 2 },
  { key: "beneficiaries", group: "estate", label: "{name} beneficiary designations", for: "adult", type: "secure_note", vault: "private", scan: false, priority: 3 },
  { key: "life_insurance", group: "estate", label: "{name} life insurance policy", for: "adult", type: "document", vault: "private", scan: true, priority: 2, note: "Add the renewal date" },
  { key: "originals", group: "estate", label: "Where the originals are kept", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 1, note: "One line so the other parent knows" },
  // Devices: one per device (from the Devices register); logins and Apple IDs go in Apple Passwords, not here
  { key: "serial", group: "devices", label: "{name} serial number and receipt", for: "device", type: "secure_note", vault: "shared", scan: false, priority: 3 },
  { key: "filevault", group: "devices", label: "Mac mini FileVault recovery key", for: "head", type: "secure_note", vault: "private", scan: false, priority: 1, note: "The most important item here for StewardOS itself" },
];

// Grouped rows the earlier template made (one note for many things). Once the per-thing rows exist, the generator
// retires these so the list never shows both. Matched on labelKey.
export const RETIRED_GROUPED_LABELS = ["health insurance cards", "dental and vision cards", "vaccination records", "bank card and brokerage account numbers", "auto insurance policy and id cards", "vins", "device serials and apple ids", "utility account numbers power gas water internet", "life insurance policies", "powers of attorney financial medical", "beneficiary designations", "will and trust documents", "operating agreements and formation documents", "alarm and security codes monitoring account", "homeowners policy and claims line", "tax returns last 7 years", "known traveler number global entry tsa precheck"];

export const PRIORITY_LABEL = { 1: "First", 2: "Soon", 3: "Later" } as const;
