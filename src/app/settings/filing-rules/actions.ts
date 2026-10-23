"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function removeFilingRule(id: string): Promise<{ ok: boolean }> {
  if (!hasSupabaseEnv()) return { ok: false };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.from("filing_rules").delete().eq("id", id);
  if (!error) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "filing_rule_removed", subject: id, ref: id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/settings/filing-rules");
  return { ok: !error };
}
