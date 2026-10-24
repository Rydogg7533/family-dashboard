// Client-safe: no server imports. Where a person's address book lives, and how each choice is set up.
export type ContactsProvider = "icloud" | "google" | "none";
export type ConnectionStatus = "waiting" | "ok" | "error";

export const CONTACTS_PROVIDERS: { id: ContactsProvider; label: string; sub: string; accountLabel: string | null }[] = [
  { id: "icloud", label: "Apple (iCloud) Contacts", sub: "Synced from your iCloud address book. Edits made here are saved back to it.", accountLabel: "Apple ID (optional)" },
  { id: "google", label: "Google Contacts", sub: "Synced from your Google account's contacts. Edits made here are saved back to it.", accountLabel: "Google address" },
  { id: "none", label: "Not connected", sub: "Contacts stay out of the dashboard. Nothing is read or written.", accountLabel: null },
];

export const providerLabel = (p: ContactsProvider | null | undefined) => CONTACTS_PROVIDERS.find((x) => x.id === (p ?? "icloud"))?.label ?? "Apple (iCloud) Contacts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Returns an error message, or null when the choice is acceptable.
export function checkChoice(provider: string, account: string): string | null {
  if (!CONTACTS_PROVIDERS.some((p) => p.id === provider)) return "Pick where your contacts live.";
  const a = account.trim();
  if (provider === "google" && !EMAIL.test(a)) return "Enter the Google address your contacts are in.";
  if (provider === "icloud" && a && !EMAIL.test(a)) return "That doesn’t look like an Apple ID email.";
  return null;
}
