"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// A shop-list item that came in through Ask (cart_items). Taking it off the list marks it; nothing is deleted.
export async function dismissCartItem(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown item." };
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { error } = await sb.from("cart_items").update({ removed_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shop");
  return { ok: true };
}
