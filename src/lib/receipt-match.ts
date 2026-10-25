// Same-receipt matching. Two documents are the same purchase when amount, date and the normalized vendor agree.
// Normalizing drops case, punctuation, parenthetical notes, store numbers and company suffixes, so
// "AAA / California Roadside Service (Club Assist)" equals "AAA California Roadside Service".
const SUFFIX = /\b(inc|llc|ltd|co|corp|company|the)\b/g;

export function normalizeVendor(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/#\s*\d+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SameRow = { id: string; merchant: string; [k: string]: unknown };

// Rule (Ryan, 2026-10-24): when the same receipt arrives twice, keep the one with more information;
// if they carry the same information, keep the first. We keep the first row as the stable id and fill
// its empty fields from the new document, so the result holds the more complete record either way.
// Returns the existing row, or null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findSameReceipt(sb: { from: (t: string) => any }, vendor: string, amount: number, date: string): Promise<SameRow | null> {
  const key = normalizeVendor(vendor);
  if (!key) return null;
  const { data } = await sb.from("receipts").select("*").eq("amount", amount).eq("date", date).is("duplicate_of", null).order("created_at", { ascending: true }).limit(20);
  return ((data ?? []) as SameRow[]).find((x) => normalizeVendor(x.merchant) === key) ?? null;
}

// Fields on the kept receipt that are empty and the new document can supply. Never overwrites a non-empty field.
export function blanksToFill(existing: SameRow, incoming: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined || v === "") continue;
    const cur = existing[k];
    if (cur === null || cur === undefined || cur === "") patch[k] = v;
  }
  return patch;
}

export type ReceiptDoc = { inbox_id: string; path: string | null; name: string | null; source: string; added_at: string };

// Attach a document to a purchase. Idempotent per inbox item: filing the same item twice adds it once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function attachDocument(sb: { from: (t: string) => any }, receiptId: string, doc: Omit<ReceiptDoc, "added_at">): Promise<void> {
  const { data } = await sb.from("receipts").select("documents").eq("id", receiptId).maybeSingle();
  const cur = ((data?.documents as ReceiptDoc[]) ?? []);
  if (cur.some((d) => d.inbox_id === doc.inbox_id)) return;
  await sb.from("receipts").update({ documents: [...cur, { ...doc, added_at: new Date().toISOString() }] }).eq("id", receiptId);
}

const DAY = 86400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
// Amounts count as close when within 25% (a pre-tip photo against the final total) or $1, whichever is larger. Claude's inference; tune from the asked/accepted counts.
export const amountsClose = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, 0.25 * Math.max(a, b));

// A likely repeat that is not exact: same normalized vendor, date within one day, amount close. Never decided silently; the person is asked.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findNearReceipt(sb: { from: (t: string) => any }, vendor: string, amount: number, date: string): Promise<SameRow | null> {
  const key = normalizeVendor(vendor);
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!key || Number.isNaN(t)) return null;
  const { data } = await sb.from("receipts").select("*").gte("date", iso(t - DAY)).lte("date", iso(t + DAY)).is("duplicate_of", null).order("created_at", { ascending: true }).limit(40);
  return ((data ?? []) as SameRow[]).find((x) => normalizeVendor(x.merchant) === key && !(x.date === date && Number(x.amount) === amount) && amountsClose(Number(x.amount), amount)) ?? null;
}
