"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Product, RegularItem, PriceWatch } from "@/lib/data-shop";
import { STORES, type StoreId } from "@/lib/c-shared";
import { ADAPTERS, addLine, cartCount, loadCart, removeLine, saveCart, setQty, type Cart, type SearchHit } from "@/lib/shopping";
import { useToast } from "@/components/c/Toast";

const btn = "min-h-9 px-2.5 rounded-lg border border-line text-xs font-semibold hover:bg-soft";

export function ShopView({ initialStore, regulars, seedResults, watches, openOrders }: { initialStore: StoreId; regulars: RegularItem[]; seedResults: Product[]; watches: PriceWatch[]; openOrders: number }) {
  const [store, setStore] = useState<StoreId>(initialStore);
  const [cart, setCart] = useState<Cart>({ amazon: [], smiths: [], costco: [] });
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>("find a 16x25x1 MERV 11 furnace filter, 4-pack");
  const [hits, setHits] = useState<SearchHit[]>(seedResults.map((p) => ({ store: p.store, name: p.name, asin: p.asin, price_note: p.price_note, rating: p.rating ?? undefined, reviews: p.reviews ?? undefined, arrival: p.arrival ?? undefined, prime: p.prime, match_note: p.match_note ?? undefined, compare_note: p.compare_note ?? undefined, url: p.url })));
  const [showAll, setShowAll] = useState(false);
  const [compare, setCompare] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const { show, el } = useToast();

  useEffect(() => {
    let c = loadCart();
    // Sample seed (matches the approved mockup) the first time this device opens Shop; cleared when the person empties the cart.
    try {
      if (!localStorage.getItem("famdash.cart.seeded")) {
        c = addLine(c, { store: "amazon", name: "Coffee, 2 lb", asin: "B00ASIN0101", qty: 1, price_note: "$[PRICE]", note: "regular, due now", added_by: "System" });
        c = addLine(c, { store: "amazon", name: "Dishwasher tabs", asin: "B00ASIN0102", qty: 1, price_note: "$[PRICE]", note: "Fri", added_by: "Melissa" });
        c = addLine(c, { store: "amazon", name: "Kids' toothpaste", asin: "B00ASIN0103", qty: 2, price_note: "$[PRICE]", added_by: "Ryan" });
        saveCart(c); localStorage.setItem("famdash.cart.seeded", "1");
      }
    } catch { /* storage blocked: unseeded, in-memory cart */ }
    setCart(c); setLoaded(true);
  }, []);
  const update = (c: Cart) => { setCart(c); saveCart(c); };

  const lines = cart[store];
  const handoff = useMemo(() => ADAPTERS[store].handoff(lines), [store, lines]);
  const storeRegulars = regulars.filter((r) => r.store === store);
  const due = storeRegulars.filter((r) => r.due && !lines.some((l) => l.key === (r.asin ?? r.name.toLowerCase())));
  const visible = showAll ? hits : hits.slice(0, 2);

  async function find(e?: React.FormEvent) {
    e?.preventDefault(); if (!q.trim()) return;
    setBusy(true); setAsked(q.trim()); setShowAll(false);
    const res = await ADAPTERS[store].search(q.trim());
    setHits(res); setBusy(false); setQ("");
  }
  function add(hit: SearchHit) {
    const line = ADAPTERS[store].add(hit, 1);
    const before = cart;
    update(addLine(cart, { ...line, added_by: "Ryan" }));
    show(`Added to the ${STORES[store].name} cart`, () => update(before));
  }
  function addUsual() {
    const before = cart; let c = cart;
    for (const r of due) c = addLine(c, { store, name: r.name, asin: r.asin, qty: r.qty, price_note: r.price_note, note: "regular, due now", added_by: "System" });
    update(c); show(`Added ${due.length} regular item${due.length === 1 ? "" : "s"} that are due`, () => update(before));
  }

  return (
    <>
      <div className="flex justify-end items-center mb-2">
        <h1 className="sr-only">Shop</h1>
        <span className="text-xs text-muted">{STORES[store].name} cart · {cartCount(cart, store)} item{cartCount(cart, store) === 1 ? "" : "s"} · $[TOTAL]</span>
      </div>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        {(Object.keys(STORES) as StoreId[]).map((s) => <button key={s} onClick={() => { setStore(s); setHits([]); setAsked(null); }} className={`px-3 py-1.5 rounded-full min-h-8 ${store === s ? "bg-accent text-white" : "bg-soft"}`}>{STORES[s].name}{cartCount(cart, s) ? ` · ${cartCount(cart, s)}` : ""}</button>)}
        <Link href="/shop/orders" className="px-3 py-1.5 rounded-full min-h-8 bg-soft flex items-center">Orders{openOrders ? ` · ${openOrders}` : ""}</Link>
      </div>

      {/* Ask finds it */}
      <form onSubmit={find} className="flex gap-2 items-center mb-3">
        <label htmlFor="ask" className="sr-only">Find a product</label>
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find… or paste a link / photo" className="flex-1 min-h-11 rounded-xl border border-line bg-bg px-3.5 text-sm" />
        <button type="button" aria-label="Camera or photo" className="min-h-11 w-12 rounded-xl border border-line bg-bg text-lg" onClick={() => show("Photo search: take a photo of the label or box · sample")}>📷</button>
        <button className="min-h-11 px-3 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50" disabled={busy || !q.trim()}>{busy ? "…" : "Find"}</button>
      </form>

      {asked && (
        <div className="flex flex-col gap-1.5 mb-3">
          <div className="text-[11px] text-muted">You asked · {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
          <div className="self-end max-w-[80%] bg-accent text-white rounded-[16px_16px_4px_16px] px-3 py-2 text-sm">{asked}</div>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex flex-col gap-2 mb-2">
          {visible.map((hit) => (
            <div key={hit.asin ?? hit.name} className="card flex gap-2.5 items-start">
              <div className="w-14 h-14 rounded-lg bg-soft shrink-0 flex items-center justify-center text-[10px] text-muted">photo</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{hit.name}</div>
                <div className="text-xs text-muted">{hit.price_note}{hit.rating ? ` · ★ ${hit.rating} (${hit.reviews})` : ""}{hit.prime ? " · Prime" : ""}{hit.arrival ? `, arrives ${hit.arrival}` : ""}</div>
                {hit.match_note && <div className="text-xs text-green font-semibold">{hit.match_note}</div>}
                {hit.compare_note && <div className="text-xs text-muted">{hit.compare_note}</div>}
                <div className="text-[10px] text-muted"><span className="font-semibold text-fg/80">Ryan asked</span> · for Family · from {STORES[store].name} public page</div>
                {compare === (hit.asin ?? hit.name) && (
                  <div className="text-xs mt-1 bg-soft rounded-lg p-2 flex flex-col gap-0.5">
                    <div className="font-semibold">Same item elsewhere (public pages)</div>
                    <div>Costco · $[PRICE] · 4-pack · pickup</div><div>Walmart · $[PRICE] · 2-pack · ships Thu</div><div>Target · $[PRICE] · not in stock nearby</div>
                  </div>
                )}
                <a href={hit.url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-accent">Open in {STORES[store].name}</a>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button className="min-h-10 px-3 rounded-lg bg-accent text-white font-semibold text-sm" onClick={() => add(hit)}>Add</button>
                <button className={btn} onClick={() => setCompare(compare === (hit.asin ?? hit.name) ? null : hit.asin ?? hit.name)}>Compare</button>
              </div>
            </div>
          ))}
          <div className="text-xs text-muted">
            {hits.length > visible.length ? <button className="font-semibold text-accent" onClick={() => setShowAll(true)}>{hits.length - visible.length} more result{hits.length - visible.length === 1 ? "" : "s"}</button> : "No more results"}
            {" · "}<button className="font-semibold text-accent" onClick={() => show("Price watch set: tell you when it is under $30 · checked daily")}>Watch price under $30</button>
          </div>
        </div>
      )}

      {/* Cart */}
      <div className="border-t border-line pt-3 mt-3 mb-3">
        <div className="flex justify-between items-center mb-1">
          <div className="text-[11px] font-bold tracking-wide text-muted">{STORES[store].name.toUpperCase()} CART · shared with Melissa</div>
          <button className={btn} onClick={addUsual} disabled={!due.length}>Add the usual{due.length ? ` · ${due.length}` : ""}</button>
        </div>
        {!loaded ? null : lines.length === 0 ? <div className="text-sm text-muted py-2">Cart is empty. Add a result above or “Add the usual”.</div> : lines.map((l) => (
          <div key={l.key} className="flex justify-between items-center gap-2 text-sm py-1.5 border-b border-line last:border-0">
            <span className="min-w-0 flex flex-col"><span className="truncate">{l.name}</span><span className="text-xs text-muted truncate"><span className="font-semibold text-fg/80">{l.added_by ?? "Ryan"} added</span>{l.note ? ` · ${l.note}` : ""} · for Family</span></span>
            <span className="shrink-0 flex items-center gap-0.5 text-xs">
              <button aria-label="Less" className="w-7 h-8 rounded-lg border border-line" onClick={() => update(setQty(cart, store, l.key, l.qty - 1))}>−</button>
              <span className="w-6 text-center">×{l.qty}</span>
              <button aria-label="More" className="w-7 h-8 rounded-lg border border-line" onClick={() => update(setQty(cart, store, l.key, l.qty + 1))}>+</button>
              <span className="ml-1.5 text-muted">{l.price_note}</span>
              <button aria-label={`Remove ${l.name}`} className="w-7 h-8 rounded-lg text-muted hover:bg-soft" onClick={() => { const before = cart; update(removeLine(cart, store, l.key)); show(`Removed ${l.name}`, () => update(before)); }}>×</button>
            </span>
          </div>
        ))}
        {lines.length > 0 && <div className="flex justify-between text-sm font-semibold pt-2"><span>Running total</span><span>$[TOTAL] · {cartCount(cart, store)} items</span></div>}
        {storeRegulars.length > 0 && (
          <div className="text-xs text-muted mt-2">
            <div className="font-bold text-[11px] tracking-wide">REGULAR AT {STORES[store].name.toUpperCase()}</div>
            {storeRegulars.map((r) => <div key={r.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{r.name}{r.due ? <span className="text-amber font-semibold"> · due</span> : null}</span><span className="shrink-0"><span className="font-semibold text-fg/80">{r.added_by}</span> · for Family</span></div>)}
          </div>
        )}
      </div>

      {/* The one hand-off button: a person always places the order */}
      {confirmSend ? (
        <div className="card border-accent flex flex-col gap-2 mb-3">
          <div className="text-sm">{handoff.note}</div>
          <div className="flex gap-2">
            {handoff.url ? <a href={handoff.url} target="_blank" rel="noreferrer" className="flex-1 min-h-12 flex items-center justify-center rounded-xl bg-accent text-white font-bold text-sm" onClick={() => { setConfirmSend(false); show(`Opened ${STORES[store].name} · the cart turns into a tracked order when the confirmation email arrives`); }}>Open {STORES[store].name}</a> : <span className="text-sm text-muted">{handoff.note}</span>}
            <button className={btn} onClick={() => setConfirmSend(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="w-full min-h-12 rounded-xl bg-accent text-white font-bold text-[15px] disabled:opacity-50 mb-3" disabled={!lines.length} onClick={() => setConfirmSend(true)}>{handoff.label}</button>
      )}

      {watches.length > 0 && <div className="text-xs text-muted">Price watch: {watches.map((w) => `${w.name} under ${w.under} (${w.current_note}) · ${w.requested_by}`).join("; ")} · <Link href="/shop/orders" className="font-semibold text-accent">Orders and problems</Link></div>}
      <p className="text-xs text-muted mt-2">The dashboard never buys. {STORES[store].handoff} Orders are then tracked from the store's emails.</p>
      {el}
    </>
  );
}
