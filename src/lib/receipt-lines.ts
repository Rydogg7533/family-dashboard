// Receipt line items and mixed receipts. A receipt can hold several kinds of purchase; the receipt itself stays whole and
// is filed once. Lines only decide where a LINK goes (for example one tire line to a vehicle's service history).
// Pure helpers (client-safe, no I/O).
export const LINE_CATEGORIES = ["vehicle", "home", "appliance_electronics", "health", "grocery_food", "dining", "fuel", "other"] as const;
export type Line = { description: string; amount: number | null; category: string };

// What the reader returned, made safe: at most 15 lines, plain text, known categories, finite amounts.
export function cleanLines(raw: unknown): Line[] {
  if (!Array.isArray(raw)) return [];
  const out: Line[] = [];
  for (const x of raw.slice(0, 15)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const description = typeof o.description === "string" ? o.description.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (!description) continue;
    const amount = typeof o.amount === "number" && Number.isFinite(o.amount) && o.amount >= 0 ? Math.round(o.amount * 100) / 100 : null;
    const c = typeof o.category === "string" ? o.category : "other";
    out.push({ description, amount, category: (LINE_CATEGORIES as readonly string[]).includes(c) ? c : "other" });
  }
  return out;
}

// "mixed" when two or more kinds each make up at least 15% of the lines (by amount when known, else by count).
export function effectiveCategory(category: string | null | undefined, lines: Line[]): string {
  const base = category && category !== "mixed" ? category : "other";
  if (category === "mixed" && lines.length < 2) return "mixed";
  if (lines.length < 2) return base;
  const known = lines.every((l) => l.amount != null);
  const total = known ? lines.reduce((s, l) => s + (l.amount as number), 0) : lines.length;
  if (!(total > 0)) return base;
  const share: Record<string, number> = {};
  for (const l of lines) share[l.category] = (share[l.category] ?? 0) + (known ? (l.amount as number) : 1);
  const big = Object.keys(share).filter((k) => share[k] / total >= 0.15);
  return big.length >= 2 ? "mixed" : (big[0] ?? base);
}

export const vehicleLines = (lines: Line[] | null | undefined): Line[] => (lines ?? []).filter((l) => l.category === "vehicle");

// The label a link carries, so it can say what part of the receipt it is (the link still opens the whole receipt).
export function lineLabel(line: Line, receipt: { vendor?: string | null; amount?: number | null; date?: string | null }): string {
  const total = typeof receipt.amount === "number" ? `$${receipt.amount.toFixed(2)}` : "";
  const from = [receipt.vendor, total, receipt.date].filter(Boolean).join(", ");
  return `${line.description}${line.amount != null ? `, $${line.amount.toFixed(2)}` : ""}${from ? ` (line on the ${from} receipt)` : ""}`;
}
