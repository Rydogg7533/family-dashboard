import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { ownerKeyOf, type ThingCard, type ThingDetail, type ThingStatus, type PriceSource, type OwnerKind } from "@/lib/things-shared";

// Sample content for preview mode (no Supabase env). Bracketed placeholders; no real values.
const SAMPLE: ThingCard[] = [
  { id: "s1", name: "[Winter jacket]", category: "Clothing", ownerKey: "shared", location: "[Hall closet]", size: "[Size]", status: "active", photoId: null, photos: 0 },
  { id: "s2", name: "[Cordless drill]", category: "Tools", ownerKey: "shared", location: "[Garage shelf]", size: null, status: "active", photoId: null, photos: 0 },
  { id: "s3", name: "[Tablet]", category: "Electronics", ownerKey: "shared", location: "[Living room]", size: null, status: "active", photoId: null, photos: 0 },
];

type PhotoRow = { id: string; position: number; removed_at: string | null; name?: string | null };

export async function getThings(): Promise<ThingCard[]> {
  if (!hasSupabaseEnv()) return SAMPLE;
  const sb = await createClient();
  const { data } = await sb.from("items").select("id, name, category, owner_kind, owner_id, location, size, status, item_photos(id, position, removed_at)").is("deleted_at", null).order("created_at", { ascending: false }).limit(1000);
  return (data ?? []).map((r) => {
    const ph = ((r.item_photos ?? []) as PhotoRow[]).filter((p) => !p.removed_at).sort((a, b) => a.position - b.position);
    return { id: r.id, name: r.name, category: r.category, ownerKey: ownerKeyOf(r.owner_kind as OwnerKind, r.owner_id), location: r.location, size: r.size, status: r.status as ThingStatus, photoId: ph[0]?.id ?? null, photos: ph.length };
  });
}

export async function getThing(id: string, owner: boolean): Promise<ThingDetail | null> {
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await createClient();
  const { data: r } = await sb.from("items").select("*, item_photos(id, name, position, removed_at)").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!r) return null;
  const photos = ((r.item_photos ?? []) as PhotoRow[]).filter((p) => !p.removed_at).sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, name: p.name ?? null }));
  let price: ThingDetail["price"] = null; let receipt: ThingDetail["receipt"] = null;
  if (owner) {
    const { data: p } = await sb.from("item_prices").select("price_cents, price_source, purchase_date, store, receipt_id").eq("item_id", id).maybeSingle();
    if (p) {
      price = { cents: p.price_cents, source: p.price_source as PriceSource | null, purchaseDate: p.purchase_date, store: p.store, receiptId: p.receipt_id };
      if (p.receipt_id) { const { data: rc } = await sb.from("receipts").select("merchant, amount, date").eq("id", p.receipt_id).maybeSingle(); if (rc) receipt = { merchant: rc.merchant, amount: Number(rc.amount), date: rc.date }; }
    }
  }
  return {
    id: r.id, name: r.name, category: r.category, ownerKey: ownerKeyOf(r.owner_kind as OwnerKind, r.owner_id), location: r.location, brand: r.brand, model: r.model, serialLast4: r.serial_last4,
    size: r.size, season: r.season, notes: r.notes, status: r.status as ThingStatus, statusAt: r.status_at, statusNote: r.status_note, linkedKind: r.linked_kind, photos, price, receipt, addedBy: r.added_by, createdAt: r.created_at,
  };
}
