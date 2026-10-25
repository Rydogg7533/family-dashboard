// Correcting what the app read from a document (card redesign, decisions log (j) item 6): a person taps a field, types the right value, and the plan
// is rebuilt WITHOUT reading the file again. The model's original value is kept beside the correction. Pure helpers (client-safe).
export const EDITABLE_FIELDS = ["vendor", "amount", "date", "item", "category"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export const FIELD_LABEL: Record<EditableField, string> = { vendor: "Vendor", amount: "Amount", date: "Date", item: "What", category: "Category" };
// "mixed" is worked out from the line items, never picked by hand.
export const CATEGORIES: { value: string; label: string }[] = [
  { value: "vehicle", label: "Vehicle" }, { value: "home", label: "Home" }, { value: "appliance_electronics", label: "Appliance or electronics" },
  { value: "health", label: "Health" }, { value: "grocery_food", label: "Groceries" }, { value: "dining", label: "Dining" }, { value: "fuel", label: "Fuel" }, { value: "other", label: "Other" },
];
export const categoryLabel = (v: unknown) => (v === "mixed" ? "Mixed" : CATEGORIES.find((c) => c.value === v)?.label ?? (typeof v === "string" && v ? v : ""));

export type Correction = { original: unknown; value: unknown; by: string; at: string };
export type Corrections = Partial<Record<EditableField, Correction>>;

export function checkCorrection(field: string, raw: unknown): { ok: true; value: string | number } | { ok: false; error: string } {
  if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) return { ok: false, error: "That field cannot be changed." };
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() : typeof raw === "number" ? String(raw) : "";
  if (!s) return { ok: false, error: "Type a value first." };
  if (field === "amount") {
    const n = Number(s.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0 || n >= 1_000_000) return { ok: false, error: "Enter an amount above $0, like 86.40." };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }
  if (field === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: "Pick a date." };
    const t = Date.parse(`${s}T12:00:00Z`);
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return { ok: false, error: "That date does not exist." };
    const year = Number(s.slice(0, 4));
    if (year < 2000 || t > Date.now() + 2 * 86_400_000) return { ok: false, error: "That date is in the future or too far back." };
    return { ok: true, value: s };
  }
  if (field === "category") return CATEGORIES.some((c) => c.value === s) ? { ok: true, value: s } : { ok: false, error: "Pick one of the categories." };
  return { ok: true, value: s.slice(0, 80) };   // vendor, item
}

// Remember the model's first value once; later corrections keep that original.
export function noteCorrection(prev: Corrections | null | undefined, field: EditableField, current: unknown, value: unknown, by: string, at: string): Corrections {
  const original = prev?.[field] ? prev[field]!.original : current ?? null;
  return { ...(prev ?? {}), [field]: { original, value, by, at } };
}

// "YYYY-MM-DD Vendor what-it-is", as the reader proposes it; null when there is not enough to build one.
export function rebuildName(p: { date?: unknown; vendor?: unknown; item?: unknown }): string | null {
  const date = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
  const vendor = typeof p.vendor === "string" ? p.vendor.trim() : "";
  const item = typeof p.item === "string" ? p.item.trim() : "";
  if (!date || !vendor) return null;
  return `${date} ${vendor}${item ? ` ${item}` : ""}`.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
}
