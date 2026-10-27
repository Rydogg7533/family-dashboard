import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { CUSTOMER_MATERIALS_FOLDER, CUSTOMER_MATERIALS_KEY, checkCustomerMaterialsSetting, type CustomerMaterial } from "@/lib/work-shared";

export * from "@/lib/work-shared";

export type CustomerMaterialsRead = { items: CustomerMaterial[]; isOwner: boolean; indexedAt: string | null };

const SAMPLE: CustomerMaterial[] = [
  { hub_id: 0, path: `${CUSTOMER_MATERIALS_FOLDER}[product-overview].md`, name: "[product-overview]", ext: ".md", updated_at: null, doc_date: null, share_link: "https://example.com/[share-link]" },
];

// The latest files in the customer-materials folder, newest first, from the hub's catalog (metadata only;
// the text stays on the hub). Share links come from household_settings, keyed by file name.
export async function getCustomerMaterials(): Promise<CustomerMaterialsRead> {
  if (!hasSupabaseEnv()) return { items: SAMPLE, isOwner: true, indexedAt: null };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const [docs, setting, prof, last] = await Promise.all([
    sb.from("documents").select("hub_id, path, name, ext, doc_date, updated_at").like("path", `${CUSTOMER_MATERIALS_FOLDER}%`).is("gone_at", null).order("updated_at", { ascending: false }).limit(20),
    sb.from("household_settings").select("value").eq("key", CUSTOMER_MATERIALS_KEY).maybeSingle(),
    user ? sb.from("profiles").select("role").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("documents").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const links = checkCustomerMaterialsSetting(setting.data?.value)?.share_links ?? {};
  const items: CustomerMaterial[] = (docs.data ?? []).map((d) => ({
    hub_id: d.hub_id, path: d.path, name: d.name.replace(/\.[a-z0-9]+$/i, ""), ext: d.ext, updated_at: d.updated_at ?? null, doc_date: d.doc_date ?? null,
    share_link: links[d.name] ?? null,
  }));
  return { items, isOwner: prof.data?.role === "owner", indexedAt: last.data?.updated_at ?? null };
}
