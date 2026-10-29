"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { IMPORT_FOLDER } from "@/lib/data-vault-import";

// What the person may do on the mapping screen. Everything here is a decision, never a secret and never a
// change to someone else's row: the folder is read, the items are created and the links are written by the
// hub, under the service role (migration 0090). Row-level security limits the app to its own run, and the
// column grants limit it to the decision columns.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function me() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user ? { sb, user } : null;
}

// Ask the hub to read a folder. Empty means the Import folder the kit made (~/StewardOS/Import), which is the
// normal case; a typed path is the exception for documents that live somewhere else. The hub decides whether it
// can read it and says so on the run if it cannot.
export async function requestFolderScan(folder: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const path = folder.trim() || IMPORT_FOLDER;
  if (path.length > 400) return { ok: false, error: "That path is too long." };
  if (!hasSupabaseEnv()) return { ok: true, id: "sample" };
  const who = await me();
  if (!who) return { ok: false, error: "Sign in again." };
  const { data, error } = await who.sb.from("vault_imports").insert({ folder: path, requested_by: who.user.id }).select("id").single();
  if (error) return { ok: false, error: "Could not ask your Mac to read that folder." };
  await who.sb.from("activity_log").insert({ actor: "1Password import", action: "vault_import_requested", subject: `Asked to read ${path}`, ref: data.id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/settings/vault/import");
  return { ok: true, id: data.id as string };
}

// One card's decisions. Nothing else on the item can be written: what the scan said and which bucket it
// landed in are the hub's, so the screen can never claim a document said something it did not.
export async function saveImportItem(id: string, patch: { include?: boolean; row_ids?: string[]; title?: string; vault_id?: string; vault_name?: string; expires_on?: string | null; note?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown item." };
  if (!hasSupabaseEnv()) return { ok: true };
  const who = await me();
  if (!who) return { ok: false, error: "Sign in again." };
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.include !== undefined) row.include = !!patch.include;
  if (patch.row_ids) row.row_ids = patch.row_ids.filter((x) => UUID.test(x)).slice(0, 12);
  if (patch.title !== undefined) row.title = patch.title.trim().slice(0, 120);
  if (patch.vault_id !== undefined) row.vault_id = patch.vault_id;
  if (patch.vault_name !== undefined) row.vault_name = patch.vault_name.slice(0, 80);
  if (patch.expires_on !== undefined) row.expires_on = patch.expires_on || null;
  if (patch.note !== undefined) row.note = patch.note.trim().slice(0, 200);
  const { error } = await who.sb.from("vault_import_items").update(row).eq("id", id);
  if (error) return { ok: false, error: "That change did not save." };
  revalidatePath("/settings/vault/import");
  return { ok: true };
}

// Hand the run back to the hub. From here the app can change nothing: row-level security only allows the
// move while the run is 'ready', and everything after it is written under the service role.
export async function applyImport(id: string, deleteFolder: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown run." };
  if (!hasSupabaseEnv()) return { ok: true };
  const who = await me();
  if (!who) return { ok: false, error: "Sign in again." };
  const { data, error } = await who.sb.from("vault_imports").update({ status: "applying", delete_folder: deleteFolder }).eq("id", id).eq("status", "ready").select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "This run is no longer waiting on you. Reload the page." };
  await who.sb.from("activity_log").insert({ actor: "1Password import", action: "vault_import_applied", subject: `Asked the Mac to create the ticked items${deleteFolder ? ", and to delete the folder after" : ""}`, ref: id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/settings/vault/import");
  return { ok: true };
}
