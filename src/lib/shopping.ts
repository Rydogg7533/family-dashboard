// Slice C: shopping cart state, the Amazon add-to-cart URL builder, and the store adapter interface (F20).
// Browser-only state lives in localStorage for v1 (per device). The migration has `carts`/`cart_items` for the
// shared-between-parents version; the Supabase sync is the next step and keeps the same shape.
import type { StoreId } from "@/lib/c-shared";

export type CartLine = { key: string; store: StoreId; name: string; asin?: string; qty: number; price_note: string; note?: string; added_by?: string; added_at: string };
export type Cart = Record<StoreId, CartLine[]>;

const KEY = "famdash.cart.v1";
export const EMPTY_CART: Cart = { amazon: [], smiths: [], costco: [] };

export function loadCart(): Cart {
  try { const raw = localStorage.getItem(KEY); if (!raw) return structuredClone(EMPTY_CART); const c = JSON.parse(raw) as Partial<Cart>; return { ...structuredClone(EMPTY_CART), ...c }; }
  catch { return structuredClone(EMPTY_CART); }
}
export function saveCart(c: Cart) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode or blocked: cart lives in memory only */ } }

export function addLine(c: Cart, line: Omit<CartLine, "added_at" | "key"> & { key?: string }): Cart {
  const key = line.key ?? line.asin ?? line.name.toLowerCase();
  const lines = c[line.store].slice();
  const i = lines.findIndex((l) => l.key === key);
  if (i >= 0) lines[i] = { ...lines[i], qty: lines[i].qty + line.qty };
  else lines.push({ ...line, key, added_at: new Date().toISOString() });
  return { ...c, [line.store]: lines };
}
export function removeLine(c: Cart, store: StoreId, key: string): Cart { return { ...c, [store]: c[store].filter((l) => l.key !== key) }; }
export function setQty(c: Cart, store: StoreId, key: string, qty: number): Cart {
  return { ...c, [store]: c[store].map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)) };
}
export function cartCount(c: Cart, store: StoreId) { return c[store].reduce((n, l) => n + l.qty, 0); }

// Amazon's documented add-to-cart form: /gp/aws/cart/add.html?ASIN.1=...&Quantity.1=...
// It opens Amazon with every line in the person's real cart. Checkout is theirs; nothing is purchased here.
export function amazonCartUrl(lines: Array<{ asin?: string; qty: number }>, associateTag?: string) {
  const p = new URLSearchParams();
  let n = 0;
  for (const l of lines) {
    if (!l.asin) continue;
    n += 1;
    p.set(`ASIN.${n}`, l.asin);
    p.set(`Quantity.${n}`, String(l.qty));
  }
  if (associateTag) p.set("AssociateTag", associateTag);
  return n ? `https://www.amazon.com/gp/aws/cart/add.html?${p.toString()}` : null;
}

// ---- store adapters: search / add / handoff ----
export type SearchHit = { store: StoreId; name: string; asin?: string; price_note: string; rating?: number; reviews?: string; arrival?: string; prime?: boolean; match_note?: string; compare_note?: string; url: string };
export type Handoff = { kind: "url" | "api" | "app"; label: string; url: string | null; note: string };

export interface StoreAdapter {
  id: StoreId;
  name: string;
  /** Find 3–5 candidates for a plain-words request, a pasted link or a photo label. Read-only, no login. */
  search(query: string): Promise<SearchHit[]>;
  /** Add a cart line (dashboard side). Returns the normalized line. */
  add(hit: SearchHit, qty: number): Omit<CartLine, "added_at" | "key">;
  /** Build the hand-off. Checkout is always the person's. */
  handoff(lines: CartLine[]): Handoff;
}

// Sample implementations: deterministic, offline. Production replaces `search` with the Mac mini reader of public
// product pages (Amazon), the Kroger Products API (Smith's) and the Instacart shoppable-list API (Costco).
export const amazonAdapter: StoreAdapter = {
  id: "amazon", name: "Amazon",
  async search(query) {
    const q = query.trim();
    const asinFromLink = /\/dp\/([A-Z0-9]{10})/i.exec(q)?.[1];
    if (asinFromLink) return [{ store: "amazon", name: `[Product from link] ${asinFromLink}`, asin: asinFromLink.toUpperCase(), price_note: "$[PRICE]", rating: 4.5, reviews: "[N]", arrival: "Tue", prime: true, url: `https://www.amazon.com/dp/${asinFromLink}` }];
    return [
      { store: "amazon", name: `[Brand] ${q || "[item]"}`, asin: "B00SAMPLE01", price_note: "$[PRICE]", rating: 4.7, reviews: "12k", arrival: "Tue", prime: true, match_note: "Matches what you bought in March", url: "https://www.amazon.com/dp/B00SAMPLE01" },
      { store: "amazon", name: `[Brand 2] ${q || "[item]"}, larger pack`, asin: "B00SAMPLE02", price_note: "$[PRICE]", rating: 4.6, reviews: "8k", arrival: "Wed", prime: true, compare_note: "Cheaper per unit · Costco has a 4-pack for $[PRICE]", url: "https://www.amazon.com/dp/B00SAMPLE02" },
      { store: "amazon", name: `[Brand 3] ${q || "[item]"}`, asin: "B00SAMPLE03", price_note: "$[PRICE]", rating: 4.4, reviews: "2k", arrival: "Thu", prime: false, url: "https://www.amazon.com/dp/B00SAMPLE03" },
    ];
  },
  add(hit, qty) { return { store: "amazon", name: hit.name, asin: hit.asin, qty, price_note: hit.price_note, note: "just added" }; },
  handoff(lines) {
    const url = amazonCartUrl(lines);
    return { kind: "url", label: "Send cart to Amazon · you place the order", url, note: url ? "Opens Amazon with these items in your real cart. Review, then tap Place order there." : "Nothing with a product ID in the cart yet." };
  },
};

export const smithsAdapter: StoreAdapter = {
  id: "smiths", name: "Smith's",
  async search(query) {
    const q = query.trim() || "[item]";
    return [
      { store: "smiths", name: `Kroger ${q}`, price_note: "$[PRICE]", match_note: "Your usual", url: "https://www.smithsfoodanddrug.com/search?query=" + encodeURIComponent(q) },
      { store: "smiths", name: `[Brand] ${q}`, price_note: "$[PRICE]", url: "https://www.smithsfoodanddrug.com/search?query=" + encodeURIComponent(q) },
    ];
  },
  add(hit, qty) { return { store: "smiths", name: hit.name, qty, price_note: hit.price_note, note: "just added" }; },
  handoff() {
    return { kind: "api", label: "Fill my Smith's cart · you check out in the app", url: "https://www.smithsfoodanddrug.com/cart", note: "Kroger's cart API adds these to your signed-in cart; you choose pickup or delivery and pay in the app." };
  },
};

export const costcoAdapter: StoreAdapter = {
  id: "costco", name: "Costco",
  async search(query) {
    const q = query.trim() || "[item]";
    return [{ store: "costco", name: `Kirkland ${q}`, price_note: "$[PRICE]", match_note: "Bought in [MONTH]", url: "https://www.costco.com/CatalogSearch?keyword=" + encodeURIComponent(q) }];
  },
  add(hit, qty) { return { store: "costco", name: hit.name, qty, price_note: hit.price_note, note: "just added" }; },
  handoff() {
    return { kind: "app", label: "Open in Instacart with the list ready · you check out", url: "https://www.instacart.com/store/costco", note: "Instacart shoppable list for Costco. Pickup or delivery slot and payment are yours in the app." };
  },
};

export const ADAPTERS: Record<StoreId, StoreAdapter> = { amazon: amazonAdapter, smiths: smithsAdapter, costco: costcoAdapter };
