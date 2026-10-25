// Client-safe: the Amazon-invoice setting's shape, defaults and checks. No server imports (client components use this).
export const AMAZON_INVOICES_KEY = "amazon_invoices";
export type BelowMode = "wait_for_history" | "ignore";
export type AmazonInvoiceSetting = { ask_min_amount: number; below: BelowMode };
export const AMAZON_INVOICE_DEFAULT: AmazonInvoiceSetting = { ask_min_amount: 0, below: "wait_for_history" };
export const MAX_ASK_AMOUNT = 100000;

// Turns whatever is stored (or typed) into a valid setting, or null when it cannot be one.
export function checkAmazonInvoiceSetting(v: unknown): AmazonInvoiceSetting | null {
  const o = v as { ask_min_amount?: unknown; below?: unknown } | null;
  const n = typeof o?.ask_min_amount === "string" ? Number(o.ask_min_amount.replace(/[$,\s]/g, "")) : Number(o?.ask_min_amount);
  if (!Number.isFinite(n) || n < 0 || n > MAX_ASK_AMOUNT) return null;
  if (o?.below !== "wait_for_history" && o?.below !== "ignore") return null;
  return { ask_min_amount: Math.round(n * 100) / 100, below: o.below };
}
