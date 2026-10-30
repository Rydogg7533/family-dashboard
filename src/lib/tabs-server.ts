import { hasSupabaseEnv, getMyProfile } from "@/lib/supabase/server";
import { DEFAULT_TABS, type TabKey } from "@/lib/tabs";

// The signed-in person's tab keys (profiles.tab_bar), or the default set.
export async function getTabKeys(): Promise<TabKey[]> {
  if (!hasSupabaseEnv()) return DEFAULT_TABS;
  const data = await getMyProfile();
  return (data?.tab_bar as TabKey[] | null)?.length ? (data!.tab_bar as TabKey[]) : DEFAULT_TABS;
}
