"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { VAULT_GROUP_IDS, isVaultLink } from "@/lib/vault";

export type VaultInput = { id?: string; group: string; label: string; item_type?: string; link?: string; expires_on?: string; note?: string; household: boolean };
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\r\n\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// Saves a pointer. The link is checked to be a 1Password link, so the Open button never goes anywhere else.
// A household pointer (Shared vault) has person = null; everything else is the saver's own.
export async function saveVaultPointer(input: VaultInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const label = clean(input.label, 120), group = clean(input.group, 20), link = clean(input.link, 600), note = clean(input.note, 300);
  if (!label) return { ok: false, error: "Give it a name, the way it is named in 1Password." };
  if (!VAULT_GROUP_IDS.includes(group)) return { ok: false, error: "Pick a group." };
  if (link && !isVaultLink(link)) return { ok: false, error: "That is not a 1Password link. In 1Password: the item's ⋯ menu › Copy Private Link." };
  const exp = /^\d{4}-\d{2}-\d{2}$/.test(input.expires_on ?? "") ? input.expires_on : null;
  if (!hasSupabaseEnv()) return { ok: true, id: "sample" };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const row = { person: input.household ? null : user.id, group, label, item_type: clean(input.item_type, 30) || null, link: link || null, expires_on: exp, note: note || null, updated_at: new Date().toISOString() };
  if (input.id) {
    const { data, error } = await sb.from("vault_pointers").update(row).eq("id", input.id).is("deleted_at", null).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "That pointer is not yours to change." };
    revalidatePath("/settings/vault");
    return { ok: true, id: data.id as string };
  }
  const { data, error } = await sb.from("vault_pointers").insert({ ...row, created_by: user.id }).select("id").single();
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "vault_pointer_added", subject: `${group}: ${label}`, ref: data.id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/settings/vault");
  return { ok: true, id: data.id as string };
}

// Hidden, never deleted.
export async function removeVaultPointer(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data, error } = await sb.from("vault_pointers").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not yours to remove." };
  revalidatePath("/settings/vault");
  return { ok: true };
}
