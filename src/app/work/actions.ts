"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { CUSTOMER_MATERIALS_KEY, checkCustomerMaterialsSetting } from "@/lib/work-shared";

// Set (or clear) the public share link for one customer-materials file. Owners only (RLS enforces it too).
// The link is what gets copied and texted; the file itself stays on the hub.
export async function setShareLink(fileName: string, url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Preview mode: nothing is saved." };
  const name = fileName.trim();
  const link = url.trim();
  if (!name) return { ok: false, error: "Which file?" };
  if (link && !/^https:\/\/[^\s]+$/.test(link)) return { ok: false, error: "The link must start with https://." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: row } = await sb.from("household_settings").select("value").eq("key", CUSTOMER_MATERIALS_KEY).maybeSingle();
  const current = checkCustomerMaterialsSetting(row?.value)?.share_links ?? {};
  const next = { ...current };
  if (link) next[name] = link; else delete next[name];
  const { error } = await sb.from("household_settings").upsert({ key: CUSTOMER_MATERIALS_KEY, value: { share_links: next }, updated_by: user.email ?? "member", updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message.includes("policy") ? "Only an owner can change share links." : error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: link ? "share_link_set" : "share_link_cleared", subject: `${name}${link ? `: ${link}` : ""}`, ref: name, undoable: false }).then(() => {}, () => {});
  revalidatePath("/work");
  return { ok: true };
}
