import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";
import { DEFAULT_TABS, type TabKey } from "@/lib/tabs";

// The signed-in person's tab keys (profiles.tab_bar), or the default set.
export async function getTabKeys(): Promise<TabKey[]> {
  if (!hasSupabaseEnv()) return DEFAULT_TABS;
  const user = await getRequestUser();
  if (!user) return DEFAULT_TABS;
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("tab_bar").eq("id", user.id).maybeSingle();
  return (data?.tab_bar as TabKey[] | null)?.length ? (data!.tab_bar as TabKey[]) : DEFAULT_TABS;
}
