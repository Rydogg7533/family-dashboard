"use server";
// Payment cards (D-2026-10-27). Owners only. A card always belongs to one account; cards are retired, never deleted.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type PaymentCardInput = { id?: string; account_id: string; form: "physical" | "virtual"; network: string; last4: string; label: string; holder: string; twin_of: string | null };

const paths = () => { revalidatePath("/money"); revalidatePath("/money/accounts"); revalidatePath("/settings/money/accounts"); revalidatePath("/money/receipts"); revalidatePath("/money/receipts-to-finish"); };

export async function savePaymentCard(c: PaymentCardInput) {
  const last4 = c.last4.replace(/\D/g, "").slice(-4);
  if (!c.account_id) return { ok: false, error: "Pick the account this card draws on." };
  if (last4.length !== 4) return { ok: false, error: "The card's last four digits are needed." };
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const row = { account_id: c.account_id, form: c.form, network: c.network.trim().slice(0, 20) || null, last4, label: c.label.trim().slice(0, 40) || null, holder: c.holder.trim().slice(0, 40) || null, twin_of: c.twin_of || null };
  const { error } = c.id ? await sb.from("payment_cards").update(row).eq("id", c.id) : await sb.from("payment_cards").insert(row);
  if (!error) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "payment_card_saved", subject: `${row.network ?? "Card"} ${row.form} ••${last4} on ${c.account_id}`, ref: c.id ?? null, undoable: false }).then(() => {}, () => {});
  paths();
  if (error) {
    const msg = error.code === "23505" ? "That card is already listed on this account." : /twin/.test(error.message) ? error.message.replace(/^.*?:\s*/, "") : "Only an owner can change cards.";
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function retirePaymentCard(id: string) {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { error } = await sb.from("payment_cards").update({ retired_at: new Date().toISOString() }).eq("id", id);
  paths();
  return { ok: !error };
}
