// Apple-Contacts-style matching. Client-safe (no server imports).
export type SearchableCard = { fullName: string; firstName: string | null; lastName: string | null; nickname: string | null; org: string | null; phones: { digits: string }[]; emails: { address: string }[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Every typed word must match the START of some word in the name, nickname or company (so "ja sm" finds Jane Smith),
// or the start of an email address. A run of 3+ digits matches anywhere in a phone number (digits only, punctuation ignored).
export function matches(c: SearchableCard, query: string): boolean {
  const q = norm(query).trim();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length >= q.replace(/[\s()+-]/g, "").length) return c.phones.some((p) => p.digits.includes(digits));
  const words = norm([c.fullName, c.firstName, c.lastName, c.nickname, c.org].filter(Boolean).join(" ")).split(/[\s,.\-_/&]+/).filter(Boolean);
  const mails = c.emails.map((e) => norm(e.address));
  return q.split(/\s+/).every((t) => words.some((w) => w.startsWith(t)) || mails.some((m) => m.startsWith(t) || m.split("@")[1]?.startsWith(t)));
}

// Apple sorts by last name (falling back to company, then first name); non-letters go under "#".
export function sortKey(c: SearchableCard) { return norm(c.lastName || c.org || c.firstName || c.fullName); }
export function groupLetter(c: SearchableCard) { const ch = sortKey(c).charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : "#"; }
