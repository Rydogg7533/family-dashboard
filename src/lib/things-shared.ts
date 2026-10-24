// Things catalog: client-safe types, constants and helpers (no Supabase import).
export type ThingStatus = "active" | "sold" | "given_away" | "lost" | "discarded";
export type PriceSource = "receipt" | "manual" | "estimated" | "suggested";
export type OwnerKind = "person" | "child" | "shared";

export const STATUS_LABEL: Record<ThingStatus, string> = { active: "Have it", sold: "Sold", given_away: "Given away", lost: "Lost", discarded: "Thrown out" };
export const GONE: ThingStatus[] = ["sold", "given_away", "lost", "discarded"];
export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = { receipt: "From a receipt", manual: "Entered by hand", estimated: "Estimated", suggested: "Suggested (not accepted yet)" };
export const SEASONS: { id: "all" | "summer" | "winter" | "spring_fall"; label: string }[] = [{ id: "all", label: "All year" }, { id: "summer", label: "Summer" }, { id: "winter", label: "Winter" }, { id: "spring_fall", label: "Spring and fall" }];

// Suggestions only: a household can type any category it wants.
export const CATEGORY_SUGGESTIONS = ["Clothing", "Shoes", "Electronics", "Appliances", "Kitchen", "Tools", "Furniture", "Toys", "Sports and outdoors", "Books and media", "Garden", "Decor", "Other"];
export const isClothing = (c: string) => /^(clothing|clothes|shoes)$/i.test(c.trim());

export type ThingCard = { id: string; name: string; category: string; ownerKey: string; location: string | null; size: string | null; status: ThingStatus; photoId: string | null; photos: number };
export type ThingPhoto = { id: string; name: string | null };
export type ThingPrice = { cents: number | null; source: PriceSource | null; purchaseDate: string | null; store: string | null; receiptId: string | null };
export type ThingDetail = {
  id: string; name: string; category: string; ownerKey: string; location: string | null; brand: string | null; model: string | null; serialLast4: string | null;
  size: string | null; season: string | null; notes: string | null; status: ThingStatus; statusAt: string | null; statusNote: string | null;
  linkedKind: string | null; photos: ThingPhoto[]; price: ThingPrice | null; receipt: { merchant: string; amount: number; date: string } | null; addedBy: string; createdAt: string;
};

export const ownerKeyOf = (kind: OwnerKind, id: string | null) => (kind === "shared" || !id ? "shared" : `${kind}:${id}`);
export const parseOwnerKey = (k: string): { kind: OwnerKind; id: string | null } => {
  const m = /^(person|child):([0-9a-f-]{36})$/i.exec(k ?? "");
  return m ? { kind: m[1] as OwnerKind, id: m[2] } : { kind: "shared", id: null };
};
export const money = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
// "$1,234.50" or "1234.5" -> cents, or null when it is not a usable amount.
export function parseDollars(s: string | null | undefined): number | null {
  const t = (s ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(parseFloat(t) * 100);
  return n >= 0 && n <= 1_000_000_000 ? n : null;
}
