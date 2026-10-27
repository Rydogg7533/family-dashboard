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

// Generate the household's checklist from the master template (D116). Reads who and what the household
// has -- adults, children, vehicles, business entities -- expands every template item against it, and adds
// only the pointers that do not already exist (matched by label, case-insensitive, among live rows). Safe
// to tap again after a new baby, a new car or a new business: it adds what is new and nothing else.
export async function generateVaultChecklist(): Promise<{ ok: boolean; added: number; total: number; others?: string[]; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, added: 0, total: 0, error: "Not available in preview." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, added: 0, total: 0, error: "Sign in first." };
  const { VAULT_TEMPLATE } = await import("@/lib/vault-template");
  const [{ data: adults }, { data: kids }, { data: vehicles }, { data: docs }, { data: household }, { data: existing }] = await Promise.all([
    sb.from("profiles").select("id, display_name, role").neq("role", "child").order("created_at"),
    sb.from("children").select("id, display_name, birth_year, profile_id").is("archived_at", null).order("birth_year"),
    sb.from("vehicles").select("id, short"),
    sb.from("documents").select("subject").like("subject", "Business/%").is("gone_at", null).limit(2000),
    sb.from("household").select("head_id").limit(1).maybeSingle(),
    sb.from("vault_pointers").select("label").is("deleted_at", null),
  ]);
  // Match on the label with any parenthetical dropped, so "VINs (Tahoe, Sienna)" counts as "VINs" and a
  // hand-named row is never duplicated by the template's plainer name.
  const key = (l: string) => l.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const have = new Set((existing ?? []).map((r) => key(String(r.label))));
  const year = new Date().getFullYear();
  const head = (household?.head_id as string | null) ?? user.id;
  const entities = Array.from(new Set((docs ?? []).map((d) => String(d.subject).split("/")[1]).filter((s) => s && s.trim())));
  const rows: { person: string | null; group: string; label: string; item_type: string; note: string | null; created_by: string }[] = [];
  const push = (person: string | null, group: string, label: string, type: string, note: string | null) => {
    if (have.has(key(label))) return;
    have.add(key(label));
    rows.push({ person, group, label, item_type: type, note, created_by: user.id });
  };
  for (const t of VAULT_TEMPLATE) {
    const base = t.note ?? null;
    // Another adult's personal items are theirs to create (the database refuses them under this login, and
    // this login cannot see them to know whether they exist), so they are made when that adult taps
    // Generate on their own login. Household items are made here for everyone.
    if (t.for === "adult") { for (const a of adults ?? []) { if (a.id === user.id) push(a.id as string, t.group, t.label.replace("{name}", String(a.display_name ?? "Member")), t.type, base); } }
    else if (t.for === "child") for (const k of kids ?? []) {
      const grown = typeof k.birth_year === "number" && year - k.birth_year >= 18;
      const name = String(k.display_name ?? "Child");
      push(null, t.group, t.label.replace("{name}", name), t.type, grown && t.adultChildNote ? `Shared vault, only if ${name} wants the family to hold a copy (an adult)` : base);
    }
    else if (t.for === "vehicle") for (const v of vehicles ?? []) push(null, t.group, t.label.replace("{name}", String(v.short)), t.type, base);
    else if (t.for === "entity") for (const e of entities) push(head, t.group, t.label.replace("{name}", e), t.type, base);
    else if (t.for === "head") push(head, t.group, t.label, t.type, base);
    else push(null, t.group, t.label, t.type, base);
  }
  const others = (adults ?? []).filter((a) => a.id !== user.id).map((a) => String(a.display_name ?? "Member"));
  if (rows.length) {
    const { error } = await sb.from("vault_pointers").insert(rows);
    if (error) return { ok: false, added: 0, total: have.size, others, error: error.message };
    await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "vault_checklist_generated", subject: `${rows.length} items added`, undoable: false }).then(() => {}, () => {});
  }
  revalidatePath("/settings/vault");
  return { ok: true, added: rows.length, total: have.size, others };
}
