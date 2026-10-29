"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { resolveTabs } from "@/lib/tabs";

// Saves the person's own tab bar (keys in order). Unknown keys drop; More is always last. Null = back to default.
export async function saveTabBar(keys: string[] | null) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const clean = keys ? resolveTabs(keys).map((t) => t.key) : null;
  const { error } = await sb.from("profiles").update({ tab_bar: clean }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
