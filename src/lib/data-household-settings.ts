import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { AMAZON_INVOICES_KEY, AMAZON_INVOICE_DEFAULT, checkAmazonInvoiceSetting, type AmazonInvoiceSetting } from "@/lib/amazon-invoice-setting";

export type SettingRead = { value: AmazonInvoiceSetting; updated_by: string | null; updated_at: string | null; isOwner: boolean };

// Falls back to the default in preview (no Supabase env) or when the stored value is not valid.
export async function getAmazonInvoiceSetting(): Promise<SettingRead> {
  if (!hasSupabaseEnv()) return { value: AMAZON_INVOICE_DEFAULT, updated_by: null, updated_at: null, isOwner: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const [row, prof] = await Promise.all([
    sb.from("household_settings").select("value, updated_by, updated_at").eq("key", AMAZON_INVOICES_KEY).maybeSingle(),
    user ? sb.from("profiles").select("role").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { value: checkAmazonInvoiceSetting(row.data?.value) ?? AMAZON_INVOICE_DEFAULT, updated_by: row.data?.updated_by ?? null, updated_at: row.data?.updated_at ?? null, isOwner: prof.data?.role === "owner" };
}
