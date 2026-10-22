// Client-safe helpers for the Email subscriptions page (no server imports).
export type EmailSubCategory = "promos" | "news" | "social" | "donations" | "travel" | "orders" | "unclear" | "account";

export const CATEGORY_ORDER: EmailSubCategory[] = ["promos", "news", "social", "donations", "travel", "orders", "unclear", "account"];
export const CATEGORY_LABEL: Record<EmailSubCategory, string> = {
  promos: "Store promotions", news: "Newsletters and updates", social: "Social networks", donations: "Donations and causes",
  travel: "Travel", orders: "Orders and shipping", unclear: "Unclear", account: "Account notices. You may want these",
};

// "about 2 a week", from the stored count and the first/last dates (no extra reading of the mailbox).
export function frequencyLabel(count: number, first: string | null, last: string | null): string {
  if (count < 3 || !first || !last) return count === 1 ? "1 email so far" : `${count} emails so far`;
  const days = Math.max(1, (Date.parse(last + "T12:00:00") - Date.parse(first + "T12:00:00")) / 86400000);
  const perWeek = ((count - 1) / days) * 7;
  if (perWeek >= 5) return "almost every day";
  if (perWeek >= 1.5) return `about ${Math.round(perWeek)} a week`;
  if (perWeek >= 0.75) return "about weekly";
  if (perWeek >= 0.35) return "every couple of weeks";
  if (perWeek >= 0.15) return "about monthly";
  return "a few a year";
}
