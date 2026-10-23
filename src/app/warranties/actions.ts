"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { syncWarrantyTasks } from "@/lib/warranties";

export type WarrantyInput = { item: string; provider?: string; for_who?: string; start?: string; end?: string; terms?: string; attachments?: { path: string; name: string; role: "receipt" | "warranty info" }[] };

function cleanFiles(a: WarrantyInput["attachments"], uid: string) {
  return (a ?? []).filter((f) => f && typeof f.path === "string" && f.path.startsWith(`${uid}/`) && (f.role === "receipt" || f.role === "warranty info")).slice(0, 8).map((f) => ({ path: f.path, name: String(f.name).slice(0, 120), role: f.role }));
}

export async function addWarranty(input: WarrantyInput): Promise<{ ok: boolean; error?: string }> {
  const item = (input.item ?? "").trim();
  if (!item) return { ok: false, error: "Say what the warranty is for." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Not available in preview." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const { error } = await sb.from("warranties").insert({ item: item.slice(0, 200), provider: input.provider?.trim().slice(0, 120) || null, for_who: input.for_who?.trim().slice(0, 80) || null, start_date: d(input.start), end_date: d(input.end), terms: input.terms?.trim().slice(0, 600) || null, attachments: cleanFiles(input.attachments, user.id), added_by: user.email ?? "member" });
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "warranty_added", subject: item.slice(0, 80), undoable: false }).then(() => {}, () => {});
  await syncWarrantyTasks(sb, user.id).catch(() => null);
  revalidatePath("/warranties"); revalidatePath("/tasks");
  return { ok: true };
}

export async function setWarrantyEnd(id: string, end: string): Promise<{ ok: boolean }> {
  if (!hasSupabaseEnv() || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: false };
  const sb = await createClient();
  const { error } = await sb.from("warranties").update({ end_date: end, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/warranties");
  return { ok: !error };
}

export async function updateWarranty(id: string, input: WarrantyInput): Promise<{ ok: boolean; error?: string }> {
  const item = (input.item ?? "").trim();
  if (!item) return { ok: false, error: "Say what the warranty is for." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Not available in preview." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const { error } = await sb.from("warranties").update({ item: item.slice(0, 200), provider: input.provider?.trim().slice(0, 120) || null, for_who: input.for_who?.trim().slice(0, 80) || null, start_date: d(input.start), end_date: d(input.end), terms: input.terms?.trim().slice(0, 600) || null, attachments: cleanFiles(input.attachments, user.id), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "warranty_edited", subject: item.slice(0, 80), ref: id, undoable: false }).then(() => {}, () => {});
  await syncWarrantyTasks(sb, user.id).catch(() => null);
  revalidatePath("/warranties"); revalidatePath("/tasks");
  return { ok: true };
}
