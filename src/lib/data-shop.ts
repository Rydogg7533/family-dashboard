// Slice C data: Shopping (F20). The dashboard finds, chooses and builds carts; a person places every order.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

import type { StoreId, OrderStatus } from "@/lib/c-shared";
export type { StoreId, OrderStatus } from "@/lib/c-shared";
export { STORES, ORDER_STEPS, ORDER_LABEL } from "@/lib/c-shared";

export type Product = {
  id: string; store: StoreId; asin?: string; name: string; price_note: string; rating: number | null; reviews: string | null;
  arrival: string | null; prime: boolean; size_note: string | null; match_note: string | null; compare_note: string | null; url: string;
};
export type RegularItem = { id: string; store: StoreId; name: string; asin?: string; qty: number; cadence_days: number; last_bought: string; due: boolean; price_note: string };
export type Order = {
  id: string; store: StoreId; placed_at: string; items: number; total_note: string; status: OrderStatus; window: string | null;
  photo: boolean; tracking_note: string | null; source: { name: string; href: string }; problem_case?: string | null;
};
export type CaseStep = { at: string; what: string; by: "assistant" | "you" | "store"; done: boolean };
export type ShopCase = {
  id: string; order_id: string; store: StoreId; item: string; issue: "missing" | "wrong" | "damaged" | "not_delivered"; price_note: string;
  route: string; status: "building" | "submitted" | "store_replied" | "refund_promised" | "refund_posted" | "resolved"; promised_by: string | null; steps: CaseStep[];
};
export type PriceWatch = { id: string; name: string; under: string; store: StoreId; current_note: string };

// ---- sample data ----
const d = (days: number) => { const x = new Date(); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

export const sampleResults: Product[] = [
  { id: "p1", store: "amazon", asin: "B00ASIN0001", name: "[Brand] 16x25x1 MERV 11, 4-pack", price_note: "$[PRICE]", rating: 4.7, reviews: "12k", arrival: "Tue", prime: true, size_note: "16x25x1 · 4-pack", match_note: "Matches what you bought in March", compare_note: null, url: "https://www.amazon.com/dp/B00ASIN0001" },
  { id: "p2", store: "amazon", asin: "B00ASIN0002", name: "[Brand 2] 16x25x1 MERV 11, 6-pack", price_note: "$[PRICE]", rating: 4.6, reviews: "8k", arrival: "Wed", prime: true, size_note: "16x25x1 · 6-pack", match_note: null, compare_note: "Cheaper per filter · Costco has a 4-pack for $[PRICE]", url: "https://www.amazon.com/dp/B00ASIN0002" },
  { id: "p3", store: "amazon", asin: "B00ASIN0003", name: "[Brand 3] 16x25x1 MERV 13, 4-pack", price_note: "$[PRICE]", rating: 4.5, reviews: "3k", arrival: "Thu", prime: false, size_note: "16x25x1 · MERV 13", match_note: null, compare_note: "Higher filtration than you usually buy", url: "https://www.amazon.com/dp/B00ASIN0003" },
];

export const sampleRegulars: RegularItem[] = [
  { id: "r1", store: "amazon", asin: "B00ASIN0101", name: "Coffee, 2 lb", qty: 1, cadence_days: 30, last_bought: d(-31), due: true, price_note: "$[PRICE]" },
  { id: "r2", store: "amazon", asin: "B00ASIN0102", name: "Dishwasher tabs", qty: 1, cadence_days: 60, last_bought: d(-20), due: false, price_note: "$[PRICE]" },
  { id: "r3", store: "amazon", asin: "B00ASIN0103", name: "Kids' toothpaste", qty: 2, cadence_days: 45, last_bought: d(-44), due: true, price_note: "$[PRICE]" },
  { id: "r4", store: "amazon", asin: "B00ASIN0104", name: "Paper towels, 12-pack", qty: 1, cadence_days: 40, last_bought: d(-12), due: false, price_note: "$[PRICE]" },
  { id: "r5", store: "smiths", name: "Milk, 2 gal", qty: 1, cadence_days: 7, last_bought: d(-6), due: true, price_note: "$[PRICE]" },
  { id: "r6", store: "smiths", name: "Eggs, 18", qty: 1, cadence_days: 10, last_bought: d(-9), due: true, price_note: "$[PRICE]" },
  { id: "r7", store: "smiths", name: "Bananas", qty: 1, cadence_days: 7, last_bought: d(-3), due: false, price_note: "$[PRICE]" },
  { id: "r8", store: "costco", name: "Rotisserie chicken", qty: 2, cadence_days: 14, last_bought: d(-15), due: true, price_note: "$[PRICE]" },
  { id: "r9", store: "costco", name: "Kirkland diapers, size [N]", qty: 1, cadence_days: 30, last_bought: d(-10), due: false, price_note: "$[PRICE]" },
  { id: "r10", store: "costco", name: "Furnace filters, 4-pack", qty: 1, cadence_days: 90, last_bought: d(-88), due: true, price_note: "$[PRICE]" },
];

const sampleOrders: Order[] = [
  { id: "o1", store: "amazon", placed_at: h(20), items: 3, total_note: "$[TOTAL]", status: "out_for_delivery", window: "Today by 8 pm", photo: false, tracking_note: "Left the Salt Lake facility 6:10 am", source: { name: "Amazon order email", href: "#" } },
  { id: "o2", store: "costco", placed_at: h(30), items: 12, total_note: "$[TOTAL]", status: "placed", window: "Pickup Tue 4–5 pm", photo: false, tracking_note: "Confirmation received; on the schedule with travel time", source: { name: "Costco confirmation email", href: "#" } },
  { id: "o3", store: "smiths", placed_at: h(70), items: 8, total_note: "$[TOTAL]", status: "delivered", window: "Delivered Thu 5:12 pm", photo: true, tracking_note: "Photo at the door", source: { name: "Smith's delivery text", href: "#" } },
  { id: "o4", store: "amazon", placed_at: h(140), items: 2, total_note: "$[TOTAL]", status: "problem", window: "Delivered Mon", photo: true, tracking_note: "1 item missing from the box", source: { name: "Amazon order email", href: "#" }, problem_case: "case1" },
  { id: "o5", store: "amazon", placed_at: h(300), items: 4, total_note: "$[TOTAL]", status: "received", window: "Received", photo: true, tracking_note: "Receipt matched to card ·· 4412", source: { name: "Amazon order email", href: "#" } },
];

const sampleCases: ShopCase[] = [
  { id: "case1", order_id: "o4", store: "amazon", item: "Coffee, 2 lb", issue: "missing", price_note: "$[PRICE]", route: "Amazon in-app “Problem with order” → refund to card", status: "refund_promised", promised_by: d(2), steps: [
    { at: h(50), what: "You tapped “something missing” on the delivered order", by: "you", done: true },
    { at: h(50), what: "Case built: order number, item, price, delivery photo, Amazon's missing-item policy", by: "assistant", done: true },
    { at: h(48), what: "Opened Amazon's problem-with-order screen with the details ready; you tapped submit", by: "you", done: true },
    { at: h(24), what: "Amazon replied: refund of $[PRICE] within 3–5 days", by: "store", done: true },
    { at: "", what: "Watching card ·· 4412 for the credit (F2 match)", by: "assistant", done: false },
    { at: "", what: "Nudge Amazon once if nothing by the promised date", by: "assistant", done: false },
    { at: "", what: "You confirm resolved when the credit posts", by: "you", done: false },
  ] },
  { id: "case2", order_id: "o3", store: "smiths", item: "Eggs, 18", issue: "damaged", price_note: "$[PRICE]", route: "Smith's app → order help → refund", status: "resolved", promised_by: null, steps: [
    { at: h(68), what: "Reported cracked eggs with photo", by: "you", done: true },
    { at: h(66), what: "Smith's credited $[PRICE] to the card", by: "store", done: true },
    { at: h(40), what: "Credit posted on card ·· 4412; you confirmed", by: "you", done: true },
  ] },
];

const sampleWatches: PriceWatch[] = [
  { id: "w1", name: "[Brand] 16x25x1 MERV 11, 4-pack", under: "$30", store: "amazon", current_note: "$[PRICE] today" },
];

// ---- readers ----
export async function getRegulars(): Promise<RegularItem[]> {
  if (!hasSupabaseEnv()) return sampleRegulars;
  const sb = await createClient();
  const { data } = await sb.from("cart_items").select("*").eq("is_regular", true).order("name");
  if (!data?.length) return sampleRegulars;
  return (data as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), store: r.store as StoreId, name: String(r.name), asin: (r.asin as string) ?? undefined, qty: Number(r.qty ?? 1), cadence_days: Number(r.cadence_days ?? 30), last_bought: String(r.last_bought ?? ""), due: Boolean(r.due), price_note: String(r.price_note ?? "$[PRICE]") }));
}

export async function getOrders(): Promise<Order[]> {
  if (!hasSupabaseEnv()) return sampleOrders;
  const sb = await createClient();
  const { data } = await sb.from("orders").select("*").order("placed_at", { ascending: false }).limit(30);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), store: r.store as StoreId, placed_at: String(r.placed_at), items: Number(r.item_count ?? 0), total_note: String(r.total_note ?? ""), status: r.status as OrderStatus,
    window: (r.window_note as string) ?? null, photo: Boolean(r.has_photo), tracking_note: (r.tracking_note as string) ?? null, source: { name: String(r.source_name ?? "Order email"), href: String(r.source_href ?? "#") }, problem_case: (r.case_id as string) ?? null,
  }));
}

export async function getCases(): Promise<ShopCase[]> {
  if (!hasSupabaseEnv()) return sampleCases;
  const sb = await createClient();
  const { data } = await sb.from("shop_cases").select("*").order("created_at", { ascending: false }).limit(30);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), order_id: String(r.order_id), store: r.store as StoreId, item: String(r.item), issue: r.issue as ShopCase["issue"], price_note: String(r.price_note ?? ""), route: String(r.route ?? ""),
    status: r.status as ShopCase["status"], promised_by: (r.promised_by as string) ?? null, steps: (r.steps as CaseStep[]) ?? [],
  }));
}

export async function getPriceWatches(): Promise<PriceWatch[]> {
  return sampleWatches; // v1: price watches are sample-only until the daily watcher exists on the Mac mini.
}
