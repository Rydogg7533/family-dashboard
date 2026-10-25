// Where a document will be filed, in plain words, and when to doubt it. Pure helpers (client-safe, no I/O).
// Receipts are filed by the Mac mini by card and month (never by the "home" folder); other documents go to their home folder.
// HOLD_DAYS must equal HOLD_DAYS in scripts/filing-agent.mjs (scripts/destination-test.mjs checks).
export const HOLD_DAYS = 14;
export type DestRead = { kind?: string; vendor?: string | null; amount?: number | null; date?: string | null; category?: string; confidence?: number | null; home?: string | null; card_last4?: string | null; card_brand?: string | null; error?: string };

export const isFiledByCard = (r: DestRead | null | undefined) => !!r && !r.error && !!r.vendor && typeof r.amount === "number" && r.amount > 0 && r.kind !== "statement";

const ROOT = /^Organized\/Personal\/Documents\//;
// "Organized/Personal/Documents/Finance/2026/Receipts/x.pdf" -> "Finance / 2026 / Receipts"
export function prettyFolder(p: string | null | undefined): string {
  if (!p) return "";
  const parts = p.replace(ROOT, "").replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length && /\.[A-Za-z0-9]{2,5}$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" / ");
}

export function destination(r: DestRead | null | undefined): { text: string; held: boolean } | null {
  if (!r || r.error) return null;
  const date = typeof r.date === "string" && /^\d{4}-\d{2}/.test(r.date) ? r.date : null;
  if (isFiledByCard(r)) {
    const year = date ? date.slice(0, 4) : String(new Date().getFullYear());
    const month = date ? date.slice(0, 7) : "month";
    const printed = r.card_last4 && /^\d{4}$/.test(String(r.card_last4)) ? `${r.card_brand && r.card_brand !== "null" ? r.card_brand : "Card"} ${r.card_last4}` : null;
    return printed
      ? { text: `Finance / ${year} / ${printed} / ${month}. The card is only on the paper, so the copy waits for you to confirm it (up to ${HOLD_DAYS} days).`, held: true }
      : { text: `Finance / ${year} / [the card that paid] / ${month}. The copy waits until you say which card paid (up to ${HOLD_DAYS} days, then Unplaced).`, held: true };
  }
  const f = prettyFolder(r.home);
  return f ? { text: f, held: false } : null;
}

// Reasons to look twice before tapping Yes. Empty when nothing looks off.
export function folderWarnings(r: DestRead | null | undefined): string[] {
  if (!r || r.error) return [];
  const w: string[] = [];
  if (typeof r.confidence === "number" && r.confidence < 0.75) w.push(`I am only ${Math.round(r.confidence * 100)}% sure of this read.`);
  if (!(typeof r.date === "string" && /^\d{4}-\d{2}/.test(r.date))) w.push("No date on the paper, so it is filed under this year.");
  if (!r.vendor && !isFiledByCard(r)) w.push("No vendor found, so the folder is a guess.");
  return w;
}

// What the Decided list says about where a filed document ended up.
export function copyState(x: { copied_path?: string | null; copy_error?: string | null; receipt_card?: string | null; is_receipt: boolean }): string {
  if (x.copy_error) return `Copy failed: ${x.copy_error.slice(0, 60)}`;
  const first = x.copied_path ? x.copied_path.split("\n")[0] : "";
  if (first) return `Copied to ${prettyFolder(first)}`;
  if (x.is_receipt && !x.receipt_card) return "Waiting for a card before it is copied";
  return "Kept in the app; the Mac mini copy is pending";
}
