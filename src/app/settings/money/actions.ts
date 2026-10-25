"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { AMAZON_INVOICES_KEY, checkAmazonInvoiceSetting, type AmazonInvoiceSetting } from "@/lib/amazon-invoice-setting";

type Res = { ok: boolean; error?: string; previous?: AmazonInvoiceSetting };

// Owners only (also enforced by RLS on household_settings). Returns the previous value so the page can offer Undo.
export async function saveAmazonInvoiceSetting(input: { ask_min_amount: number | string; below: string }): Promise<Res> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Not available in preview." };
  const next = checkAmazonInvoiceSetting(input);
  if (!next) return { ok: false, error: "Enter an amount of $0 or more, and choose what happens below it." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: prof } = await sb.from("profiles").select("role, display_name").eq("id", user.id).maybeSingle();
  if (prof?.role !== "owner") return { ok: false, error: "Only an owner can change this." };
  const { data: cur } = await sb.from("household_settings").select("value").eq("key", AMAZON_INVOICES_KEY).maybeSingle();
  const previous = checkAmazonInvoiceSetting(cur?.value) ?? undefined;
  const who = prof?.display_name ?? user.email ?? "owner";
  const { error } = await sb.from("household_settings").upsert({ key: AMAZON_INVOICES_KEY, value: next, updated_by: who, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? who, action: "amazon_invoice_setting_changed", subject: `ask at $${next.ask_min_amount}+, below: ${next.below}`.slice(0, 80), undoable: false }).then(() => {}, () => {});
  revalidatePath("/settings/money");
  return { ok: true, previous };
}
