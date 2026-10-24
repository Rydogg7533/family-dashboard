import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { ChildRow } from "@/lib/children";

// Children shown in the app (with or without a login) and the household's default minimum login age. Read under the viewer's own session
// (members only; a child login sees none). Sample mode shows none.
export async function getChildRows(): Promise<ChildRow[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.from("children").select("id,display_name,birth_year,login_min_age,profile_id").is("archived_at", null).order("birth_year");
    return (data ?? []) as ChildRow[];
  } catch { return []; }
}
export async function getHouseholdMinAge(): Promise<number> {
  if (!hasSupabaseEnv()) return 10;
  try {
    const sb = await createClient();
    const { data } = await sb.from("household").select("child_login_min_age").eq("id", 1).maybeSingle();
    return Number(data?.child_login_min_age ?? 10);
  } catch { return 10; }
}
