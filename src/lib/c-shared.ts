// Slice C: client-safe types, constants and formatting helpers (no Supabase import). The data-*.ts files
// re-export these so server pages can import from either place; client components import from here only.

// ---- time and date ----
export function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}
export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am"; const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, "0")} ${ampm}` : `${hh} ${ampm}`;
}
export function shortTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}
export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", opts);
}
export function daysUntil(iso: string) {
  return Math.round((new Date(iso + "T12:00:00").getTime() - Date.now()) / 86_400_000);
}
export function clock(iso: string) {
  const dt = new Date(iso); const sameDay = dt.toDateString() === new Date().toDateString();
  return sameDay ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/ ?(AM|PM)$/i, "") : dt.toLocaleDateString("en-US", { weekday: "short" });
}

// ---- weather ----
export type Weather = { temp: number; hi?: number; precip?: number; wind?: number; note: string; icon: "sun" | "cloud" | "rain" | "snow" | "wind" };
export function weatherGlyph(icon: Weather["icon"]) {
  return { sun: "☀", cloud: "☁", rain: "☂", snow: "❄", wind: "≋" }[icon];
}
export function weatherLine(w: Weather | null) {
  if (!w) return null;
  const parts = [`${w.temp}°${w.hi ? `→${w.hi}°` : ""}`];
  if (w.precip && w.precip >= 30) parts.push(`${w.precip}% rain`);
  if (w.wind && w.wind >= 15) parts.push(`wind ${w.wind} mph`);
  parts.push(w.note);
  return parts.join(" · ");
}

// ---- shopping ----
export type StoreId = "amazon" | "smiths" | "costco";
export const STORES: Record<StoreId, { name: string; handoff: string }> = {
  amazon: { name: "Amazon", handoff: "Opens Amazon with the cart filled (add-to-cart link). You place the order." },
  smiths: { name: "Smith's", handoff: "Fills your Smith's cart through the Kroger API. You pick the slot and pay in the app." },
  costco: { name: "Costco", handoff: "Opens Instacart (or the Costco app) with the list ready. You check out." },
};
export type OrderStatus = "placed" | "shipped" | "out_for_delivery" | "delivered" | "received" | "problem";
export const ORDER_STEPS: OrderStatus[] = ["placed", "shipped", "out_for_delivery", "delivered", "received"];
export const ORDER_LABEL: Record<OrderStatus, string> = { placed: "Placed", shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered", received: "Received", problem: "Problem" };

// ---- voice ----
export type CallStatus = "awaiting_approval" | "approved" | "calling" | "needs_you" | "done" | "declined";
export const CALL_LABEL: Record<CallStatus, { text: string; cls: string }> = {
  awaiting_approval: { text: "NEEDS YOUR APPROVAL", cls: "text-amber" }, approved: { text: "APPROVED · WILL CALL", cls: "text-accent" }, calling: { text: "ON THE CALL", cls: "text-accent" },
  needs_you: { text: "NEEDS YOU", cls: "text-amber" }, done: { text: "DONE", cls: "text-green" }, declined: { text: "DECLINED", cls: "text-muted" },
};
