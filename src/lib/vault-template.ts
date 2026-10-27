// The master checklist of sensitive items a household keeps in 1Password (D116). What was built by hand on
// 2026-10-26 (claude/stewardos-decisions-log-2026-10-26s.md), written down once so any household gets the
// same list for its own people, vehicles and businesses with one tap. `for` says who or what each item
// applies to; the generator expands it against the household and never makes an item that already exists.
import type { VaultGroup } from "@/lib/vault";

export type Applies = "adult" | "child" | "household" | "vehicle" | "entity" | "head";
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
  // Identity
  { key: "passport", group: "identity", label: "{name} passport", for: "adult", type: "passport", vault: "private", scan: true, priority: 1, note: "Add the expiry date; it reminds 90 days out" },
  { key: "passport", group: "identity", label: "{name} passport", for: "child", type: "passport", vault: "shared", scan: true, priority: 2, note: "Shared vault, held by parents", adultChildNote: true },
  { key: "license", group: "identity", label: "{name} driver license", for: "adult", type: "driver_license", vault: "private", scan: true, priority: 1, note: "Add the expiry date" },
  { key: "ssn", group: "identity", label: "{name} Social Security card", for: "adult", type: "ssn", vault: "private", scan: true, priority: 1 },
  { key: "ssn", group: "identity", label: "{name} Social Security card", for: "child", type: "ssn", vault: "shared", scan: true, priority: 1, note: "Shared vault", adultChildNote: true },
  { key: "birth", group: "identity", label: "{name} birth certificate", for: "adult", type: "document", vault: "private", scan: true, priority: 2 },
  { key: "birth", group: "identity", label: "{name} birth certificate", for: "child", type: "document", vault: "shared", scan: true, priority: 2, note: "Shared vault", adultChildNote: true },
  { key: "marriage", group: "identity", label: "Marriage certificate", for: "household", type: "document", vault: "shared", scan: true, priority: 3 },
  { key: "traveler", group: "identity", label: "{name} known traveler number (Global Entry / TSA PreCheck)", for: "adult", type: "membership", vault: "private", scan: false, priority: 3, note: "Only if there is one" },
  // Vehicles
  { key: "title", group: "vehicles", label: "{name} title", for: "vehicle", type: "document", vault: "shared", scan: true, priority: 2, note: "Also: the vehicle › Where the title is kept" },
  { key: "registration", group: "vehicles", label: "{name} registration", for: "vehicle", type: "document", vault: "shared", scan: true, priority: 1, note: "Put the expiry in the vehicle › Registration expires" },
  { key: "auto_insurance", group: "vehicles", label: "Auto insurance policy and ID cards", for: "household", type: "document", vault: "shared", scan: true, priority: 1, note: "Also: each vehicle › Insurance › Policy" },
  { key: "vehicle_loan", group: "vehicles", label: "Vehicle loan account", for: "household", type: "bank_account", vault: "shared", scan: false, priority: 2, note: "If financed; also: the vehicle › Loan account" },
  { key: "vin", group: "vehicles", label: "VINs", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 2, note: "The app keeps only this pointer" },
  // Home
  { key: "deed", group: "home", label: "Deed and closing documents", for: "household", type: "document", vault: "shared", scan: true, priority: 2 },
  { key: "mortgage", group: "home", label: "Mortgage account", for: "household", type: "bank_account", vault: "shared", scan: false, priority: 2 },
  { key: "home_insurance", group: "home", label: "Homeowners policy and claims line", for: "household", type: "document", vault: "shared", scan: true, priority: 1, note: "Add the renewal date" },
  { key: "hoa", group: "home", label: "HOA account", for: "household", type: "membership", vault: "shared", scan: false, priority: 3, note: "If any" },
  { key: "alarm", group: "home", label: "Alarm and security codes, monitoring account", for: "head", type: "secure_note", vault: "private", scan: false, priority: 1, note: "Never in the app; Ask only opens it" },
  { key: "utilities", group: "home", label: "Utility account numbers (power, gas, water, internet)", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 3 },
  // Health
  { key: "health_cards", group: "health", label: "Health insurance cards", for: "household", type: "document", vault: "shared", scan: true, priority: 1, note: "One item per person, or one with all cards attached" },
  { key: "dental", group: "health", label: "Dental and vision cards", for: "household", type: "document", vault: "shared", scan: true, priority: 2 },
  { key: "hsa", group: "health", label: "HSA / FSA account", for: "head", type: "bank_account", vault: "private", scan: false, priority: 2 },
  { key: "rx", group: "health", label: "{name} prescription numbers", for: "adult", type: "secure_note", vault: "private", scan: false, priority: 3, note: "Also: each medication › Prescription" },
  { key: "vaccines", group: "health", label: "Vaccination records", for: "household", type: "document", vault: "shared", scan: true, priority: 3, note: "If you keep them" },
  // Money
  { key: "accounts", group: "money", label: "Bank, card and brokerage account numbers", for: "head", type: "bank_account", vault: "private", scan: false, priority: 1, note: "One 1Password item per account; add a pointer per account as you go" },
  { key: "taxes", group: "money", label: "Tax returns (last 7 years)", for: "head", type: "document", vault: "private", scan: false, priority: 2, note: "Files live in Organized/Personal/Documents/Finance/Taxes" },
  { key: "cpa", group: "money", label: "CPA portal", for: "head", type: "secure_note", vault: "private", scan: false, priority: 3 },
  { key: "crypto", group: "money", label: "Crypto exchange and wallet recovery phrases", for: "head", type: "secure_note", vault: "private", scan: false, priority: 1, note: "Nowhere else, ever; Ask only opens it" },
  // Business
  { key: "ein", group: "business", label: "EIN letter — {name}", for: "entity", type: "document", vault: "private", scan: true, priority: 2 },
  { key: "formation", group: "business", label: "Operating agreement and formation documents — {name}", for: "entity", type: "document", vault: "private", scan: false, priority: 3 },
  { key: "domains", group: "business", label: "Domain registrar and DNS", for: "head", type: "secure_note", vault: "private", scan: false, priority: 2 },
  { key: "biz_insurance", group: "business", label: "Business insurance", for: "head", type: "document", vault: "private", scan: true, priority: 3, note: "If any; add the renewal date" },
  // Estate
  { key: "will", group: "estate", label: "Will and trust documents", for: "household", type: "document", vault: "shared", scan: true, priority: 2 },
  { key: "poa", group: "estate", label: "Powers of attorney (financial, medical)", for: "household", type: "document", vault: "shared", scan: true, priority: 2 },
  { key: "beneficiaries", group: "estate", label: "Beneficiary designations", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 3 },
  { key: "life_insurance", group: "estate", label: "Life insurance policies", for: "household", type: "document", vault: "shared", scan: true, priority: 2 },
  { key: "originals", group: "estate", label: "Where the originals are kept", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 1, note: "One line so the other parent knows" },
  // Devices
  { key: "serials", group: "devices", label: "Device serials and Apple IDs", for: "household", type: "secure_note", vault: "shared", scan: false, priority: 3, note: "Also: each device › Serial" },
  { key: "filevault", group: "devices", label: "Mac mini FileVault recovery key", for: "head", type: "secure_note", vault: "private", scan: false, priority: 1, note: "The most important item here for StewardOS itself" },
];

export const PRIORITY_LABEL = { 1: "First", 2: "Soon", 3: "Later" } as const;
