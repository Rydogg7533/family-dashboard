// Statements: which account a statement belongs to, and how it is named and filed. Pure helpers (client-safe).
export type AccountRow = { id: string; institution: string; last4: string; retired_at?: string | null };
export const accountLabel = (a: AccountRow) => `${a.institution} ····${a.last4}`;
const last4Of = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-4);

// The account whose last four digits are printed on the statement, or null.
export function matchAccount(accounts: AccountRow[], cardLast4: unknown): AccountRow | null {
  const l4 = last4Of(cardLast4);
  if (l4.length !== 4) return null;
  const hits = accounts.filter((a) => !a.retired_at && a.last4 === l4);
  return hits.length === 1 ? hits[0] : null;   // two accounts ending the same way are never guessed between
}
// An answer that names an account ("Wells Fargo ····0848") picks that account.
export function accountFromAnswer(accounts: AccountRow[], answer: string): AccountRow | null {
  return accounts.find((a) => accountLabel(a) === answer.trim()) ?? null;
}
// The statement month is worked out in statement-checks.ts (resolvePeriod) from the closing date, never taken from the reader.
export const statementName = (period: string, a: AccountRow) => `${period} ${accountLabel(a)} statement`;
// The folder is the account's own label ("Wells Fargo ····6918"), with any character a file system dislikes removed.
export const statementFolder = (a: AccountRow) => accountLabel(a).replace(/[\\/:*?"<>|]/g, "").trim();
export const statementHome = (period: string, a: AccountRow) => `Organized/Personal/Documents/Finance/${period.slice(0, 4)}/Statements/${statementFolder(a)}/`;

// A second clue when the page gave no account number: a standalone 4-digit group (not part of a longer run of letters or digits, so a random id prefix cannot match) in the file name (for example
// "…-5761 - 123456 WellsFargo.pdf") that equals exactly one live account's last four. Years (19xx, 20xx) are ignored,
// and two groups pointing at different accounts is no match, so the person is asked instead.
export function accountFromFileName(accounts: AccountRow[], fileName: unknown): AccountRow | null {
  const base = String(fileName ?? "").split("/").pop() ?? "";
  const groups = [...base.matchAll(/(?<![A-Za-z0-9])([0-9]{4})(?![A-Za-z0-9])/g)].map((m) => m[1]).filter((g) => !/^(19|20)[0-9]{2}$/.test(g));
  const live = accounts.filter((a) => !a.retired_at);
  const hits = new Set(live.filter((a) => groups.includes(a.last4)).map((a) => a.id));
  return hits.size === 1 ? live.find((a) => hits.has(a.id)) ?? null : null;
}
// The printed last four first, then the file name. `via` says which, so the screen can show how it was matched.
// When the page and the file name each point at a different account, `conflict` names the file name's account; the checks hold the statement back.
export function resolveAccount(accounts: AccountRow[], printedLast4: unknown, fileName: unknown): { acct: AccountRow; via: "printed" | "file name"; conflict?: AccountRow } | null {
  const a = matchAccount(accounts, printedLast4);
  const b = accountFromFileName(accounts, fileName);
  if (a) return b && b.id !== a.id ? { acct: a, via: "printed", conflict: b } : { acct: a, via: "printed" };
  return b ? { acct: b, via: "file name" } : null;
}
export const conflictNote = (printed: AccountRow, byName: AccountRow) => `The page shows ····${printed.last4}, but the file name points to ····${byName.last4}.`;

// Why a statement could not be matched, in one plain sentence for the top of the question. Null when it can be matched.
export function whyNoMatch(accounts: AccountRow[], printedLast4: unknown, fileName: unknown, confidence?: number | null): string | null {
  if (resolveAccount(accounts, printedLast4, fileName)) return typeof confidence === "number" && confidence < 0.6 ? "Not matched on my own: I was not sure enough of the read." : null;
  const l4 = last4Of(printedLast4);
  if (l4.length === 4 && accounts.filter((a) => !a.retired_at && a.last4 === l4).length > 1) return `Not filed: more than one of your accounts ends in ····${l4}. Pick the right one.`;
  if (l4.length === 4) return `Not filed: the page shows ····${l4}, but none of your accounts ends in that. Add it in Settings, or pick one.`;
  const base = String(fileName ?? "").split("/").pop() ?? "";
  const groups = [...base.matchAll(/(?<![A-Za-z0-9])([0-9]{4})(?![A-Za-z0-9])/g)].map((m) => m[1]).filter((g) => !/^(19|20)[0-9]{2}$/.test(g));
  const hits = new Set(accounts.filter((a) => !a.retired_at && groups.includes(a.last4)).map((a) => a.id));
  if (hits.size > 1) return "Not filed: the file name points at more than one of your accounts.";
  return "Not filed: no account number was found on the page, and the file name matches none of your accounts.";
}
