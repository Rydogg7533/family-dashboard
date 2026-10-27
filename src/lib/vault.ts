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
  const kid = kids.find((k) => label.startsWith(k.name.toLowerCase() + " "));
  return kid ? `k:${kid.id}` : "shared";
}

// A 1Password private link, or the app scheme. Anything else is refused so the Open button can be trusted.
export const isVaultLink = (s: string) => /^https:\/\/start\.1password\.com\/open\//i.test(s) || /^onepassword:\/\//i.test(s) || /^https:\/\/[a-z0-9-]+\.1password\.com\//i.test(s);
