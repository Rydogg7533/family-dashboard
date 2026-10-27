// Work area (F12.7), client-safe part. No Supabase import here.

export const WORK_ENTITY = "Veil Labs";
// Files under this folder on the hub are the customer-facing materials for StewardOS. Keep editing the same
// file in place: the catalog follows the path, so the card always shows the current version.
export const CUSTOMER_MATERIALS_FOLDER = "Organized/Business/Veil Labs/04_Product/StewardOS/";
export const CUSTOMER_MATERIALS_KEY = "customer_materials";

export type CustomerMaterial = {
  hub_id: number;
  path: string;
  name: string;         // file name without extension
  ext: string;
  updated_at: string | null;
  doc_date: string | null;
  share_link: string | null; // public link to send; set per file in Settings, null until set
};

export type CustomerMaterialsSetting = { share_links: Record<string, string> }; // file name (with ext) → URL

export function checkCustomerMaterialsSetting(v: unknown): CustomerMaterialsSetting | null {
  if (!v || typeof v !== "object") return null;
  const links = (v as { share_links?: unknown }).share_links;
  if (!links || typeof links !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, u] of Object.entries(links as Record<string, unknown>)) if (typeof u === "string" && /^https:\/\//.test(u)) out[k] = u;
  return { share_links: out };
}

export function smsHref(text: string) {
  return `sms:&body=${encodeURIComponent(text)}`;
}
