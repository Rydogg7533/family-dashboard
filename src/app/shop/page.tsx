import { getOrders, getPriceWatches, getRegulars, sampleResults, type StoreId } from "@/lib/data-shop";
import { ShopView } from "@/components/c/ShopView";

export const dynamic = "force-dynamic";

// F20: find, choose and build the cart here; the person places every order in the store's app.
export default async function Shop({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams;
  const store = (["amazon", "smiths", "costco"].includes(String(sp.store)) ? String(sp.store) : "amazon") as StoreId;
  const [regulars, watches, orders] = await Promise.all([getRegulars(), getPriceWatches(), getOrders()]);
  const open = orders.filter((o) => !["received"].includes(o.status)).length;
  return <ShopView initialStore={store} regulars={regulars} seedResults={store === "amazon" ? sampleResults : []} watches={watches} openOrders={open} />;
}
