"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { parseOwnerKey, parseDollars, SEASONS, type ThingStatus } from "@/lib/things-shared";

export type ThingInput = { name: string; category: string; owner: string; location?: string; brand?: string; model?: string; serialLast4?: string; size?: string; season?: string; notes?: string; areaId?: string };
export type NewPhoto = { path: string; thumb: string; name: string };
type Res = { ok: boolean; error?: string; id?: string; note?: string };

async function who() {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { sb, user, actor: user.email ?? "member", owner: prof?.role === "owner" };
}
const t = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n) || null;
const log = async (w: NonNullable<Awaited<ReturnType<typeof who>>>, action: string, subject: string, ref?: string) => { await w.sb.from("activity_log").insert({ actor: w.actor, action, subject: subject.slice(0, 80), ref: ref ?? null, undoable: false }).then(() => {}, () => {}); };
const cleanPhotos = (ph: NewPhoto[] | undefined, uid: string) => (ph ?? []).filter((p) => p && typeof p.path === "string" && p.path.startsWith(`${uid}/things/`) && (!p.thumb || p.thumb.startsWith(`${uid}/things/`))).slice(0, 12);

function fields(input: ThingInput) {
  const o = parseOwnerKey(input.owner);
  const season = SEASONS.some((s) => s.id === input.season) ? input.season : null;
  const cat = (input.category ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  return {
    name: (input.name ?? "").trim().slice(0, 200), category: cat ? cat[0].toUpperCase() + cat.slice(1) : "Other", owner_kind: o.kind, owner_id: o.id,
    location: t(input.location, 120), brand: t(input.brand, 80), model: t(input.model, 80), serial_last4: t(input.serialLast4, 4), size: t(input.size, 40), season, notes: t(input.notes, 1000),
    // Only set when the form says which area it is for; an edit that does not mention an area leaves the area alone.
    ...(input.areaId && /^[0-9a-f-]{36}$/i.test(input.areaId) ? { area_id: input.areaId } : {}),
  };
}

export async function addThing(input: ThingInput, photos: NewPhoto[]): Promise<Res> {
  const f = fields(input);
  if (!f.name) return { ok: false, error: "Give it a name." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { data, error } = await w.sb.from("items").insert({ ...f, added_by: w.actor, updated_by: w.actor }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save." };
  const ph = cleanPhotos(photos, w.user.id);
  if (ph.length) {
    const { error: pe } = await w.sb.from("item_photos").insert(ph.map((p, i) => ({ item_id: data.id, path: p.path, thumb_path: p.thumb || null, name: p.name.slice(0, 120), position: i })));
    if (pe) return { ok: false, id: data.id, error: `The item saved but its photos did not attach (${pe.message}). Open it and add the photos again.` };
  }
  await log(w, "thing_added", f.name, data.id);
  revalidatePath("/things");
  return { ok: true, id: data.id };
}

export async function updateThing(id: string, input: ThingInput): Promise<Res> {
  const f = fields(input);
  if (!f.name) return { ok: false, error: "Give it a name." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("items").update({ ...f, updated_by: w.actor, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "thing_edited", f.name, id);
  revalidatePath("/things"); revalidatePath(`/things/${id}`);
  return { ok: true, id };
}

export async function addThingPhotos(itemId: string, photos: NewPhoto[]): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const ph = cleanPhotos(photos, w.user.id);
  if (!ph.length) return { ok: false, error: "No photos to add." };
  const { count } = await w.sb.from("item_photos").select("id", { count: "exact", head: true }).eq("item_id", itemId).is("removed_at", null);
  const { error } = await w.sb.from("item_photos").insert(ph.map((p, i) => ({ item_id: itemId, path: p.path, thumb_path: p.thumb || null, name: p.name.slice(0, 120), position: (count ?? 0) + i })));
  if (error) return { ok: false, error: error.message };
  await w.sb.from("items").update({ updated_at: new Date().toISOString(), updated_by: w.actor }).eq("id", itemId);
  await log(w, "thing_photo_added", `${ph.length} photo(s)`, itemId);
  revalidatePath("/things"); revalidatePath(`/things/${itemId}`);
  return { ok: true };
}

// A photo is hidden, never deleted: the file stays in storage and the row keeps removed_at.
export async function removeThingPhoto(photoId: string, itemId: string): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("item_photos").update({ removed_at: new Date().toISOString() }).eq("id", photoId);
  if (error) return { ok: false, error: error.message };
  await log(w, "thing_photo_hidden", "photo", itemId);
  revalidatePath("/things"); revalidatePath(`/things/${itemId}`);
  return { ok: true };
}

export async function setThingStatus(id: string, status: ThingStatus, note?: string): Promise<Res> {
  if (!["active", "sold", "given_away", "lost", "discarded"].includes(status)) return { ok: false, error: "Unknown status." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("items").update({ status, status_at: status === "active" ? null : new Date().toISOString().slice(0, 10), status_note: status === "active" ? null : t(note, 300), updated_by: w.actor, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "thing_status", status, id);
  revalidatePath("/things"); revalidatePath(`/things/${id}`);
  return { ok: true };
}

// Owners only (also enforced by row security). A hand-entered price always wins.
export async function setThingPrice(id: string, dollars: string, purchaseDate?: string, store?: string, estimated?: boolean): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  if (!w.owner) return { ok: false, error: "Only a parent with the owner role can change prices." };
  const clear = dollars.trim() === "";
  const cents = clear ? null : parseDollars(dollars);
  if (!clear && cents === null) return { ok: false, error: "Enter the price as a number, like 49.99." };
  const d = purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? purchaseDate : null;
  const { data: cur } = await w.sb.from("item_prices").select("price_cents, price_source").eq("item_id", id).maybeSingle();
  const { error } = await w.sb.from("item_prices").upsert({ item_id: id, price_cents: cents, price_source: cents === null ? null : estimated ? "estimated" : "manual", purchase_date: d, store: t(store, 120), updated_by: w.actor, updated_at: new Date().toISOString() }, { onConflict: "item_id", ignoreDuplicates: false });
  if (error) return { ok: false, error: error.message };
  await log(w, "thing_price", cents === null ? "price cleared" : `price set (${estimated ? "estimated" : "manual"}${cur?.price_source === "receipt" ? ", replaced receipt price" : ""})`, id);
  revalidatePath(`/things/${id}`); revalidatePath("/things");
  return { ok: true };
}

export type PickReceipt = { id: string; merchant: string; amount: number; date: string };
// Recent receipts for the picker, likeliest first (same store, then closest to the purchase date).
export async function listReceiptsForItem(itemId: string): Promise<{ ok: boolean; receipts: PickReceipt[] }> {
  const w = await who(); if (!w || !w.owner) return { ok: false, receipts: [] };
  const [{ data: rec }, { data: pr }] = await Promise.all([
    w.sb.from("receipts").select("id, merchant, amount, date").is("duplicate_of", null).order("date", { ascending: false }).limit(80),
    w.sb.from("item_prices").select("store, purchase_date").eq("item_id", itemId).maybeSingle(),
  ]);
  const store = pr?.store?.toLowerCase() ?? ""; const pd = pr?.purchase_date ? new Date(pr.purchase_date + "T12:00:00").getTime() : null;
  const score = (r: PickReceipt) => (store && r.merchant.toLowerCase().includes(store) ? 2 : 0) + (pd && Math.abs(new Date(r.date + "T12:00:00").getTime() - pd) <= 3 * 86400000 ? 1 : 0);
  const list = ((rec ?? []) as PickReceipt[]).map((r) => ({ id: r.id, merchant: r.merchant, amount: Number(r.amount), date: r.date })).sort((a, b) => score(b) - score(a));
  return { ok: true, receipts: list.slice(0, 40) };
}

// Links a receipt to the item. Only when the person says the receipt is for just this item does the price fill in, and a hand-entered price is never replaced.
export async function attachReceipt(id: string, receiptId: string, single: boolean): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  if (!w.owner) return { ok: false, error: "Only a parent with the owner role can change prices." };
  const { data: r } = await w.sb.from("receipts").select("id, merchant, amount, date").eq("id", receiptId).maybeSingle();
  if (!r) return { ok: false, error: "That receipt was not found." };
  const { data: cur } = await w.sb.from("item_prices").select("price_cents, price_source").eq("item_id", id).maybeSingle();
  const keepManual = cur?.price_source === "manual" && cur.price_cents != null;
  const fillPrice = single && !keepManual;
  const row: Record<string, unknown> = { item_id: id, receipt_id: r.id, store: r.merchant, purchase_date: r.date, updated_by: w.actor, updated_at: new Date().toISOString() };
  if (fillPrice) { row.price_cents = Math.round(Number(r.amount) * 100); row.price_source = "receipt"; }
  else if (cur) { row.price_cents = cur.price_cents; row.price_source = cur.price_source; }
  const { error } = await w.sb.from("item_prices").upsert(row, { onConflict: "item_id" });
  if (error) return { ok: false, error: error.message };
  await log(w, "thing_receipt", `${r.merchant} receipt linked${fillPrice ? ", price filled" : ""}`, id);
  revalidatePath(`/things/${id}`); revalidatePath("/things");
  return { ok: true, note: fillPrice ? "Receipt linked and price filled in. You can still change it." : single && keepManual ? "Receipt linked. Your own price was kept." : "Receipt linked. No price was filled in, because it covers more than this item." };
}
