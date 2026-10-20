"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

const STATUSES = ["open", "submitted", "paid", "denied", "closed"] as const;
export type ClaimStatus = (typeof STATUSES)[number];

// Moves a claim along. When it reaches a final state its check-back reminder is completed too.
export async function setClaimStatus(id: string, status: ClaimStatus, note?: string) {
  if (!hasSupabaseEnv() || !STATUSES.includes(status)) return { ok: !hasSupabaseEnv() };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: c } = await sb.from("claims").select("title,notes").eq("id", id).maybeSingle();
  if (!c) return { ok: false };
  const stamp = `${new Date().toISOString().slice(0, 10)} ${user.email ?? "member"}: ${status}${note ? ` (${note.slice(0, 200)})` : ""}`;
  const { error } = await sb.from("claims").update({ status, notes: [c.notes, stamp].filter(Boolean).join("\n"), updated_at: new Date().toISOString() }).eq("id", id);
  if (!error && ["paid", "denied", "closed"].includes(status)) await sb.from("tasks").update({ status: "done", updated_at: new Date().toISOString() }).eq("origin_kind", "claim").eq("origin_ref", id).then(() => {}, () => {});
  if (!error) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "claim_status", subject: `${c.title}: ${status}`, ref: id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/claims"); revalidatePath("/tasks");
  return { ok: !error };
}

// Push the check-back date out (they said four weeks; it is now five).
export async function snoozeClaim(id: string, days: number) {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const when = new Date(Date.now() + Math.max(1, Math.min(60, days)) * 86400_000).toISOString().slice(0, 10);
  const { error } = await sb.from("claims").update({ check_by: when, updated_at: new Date().toISOString() }).eq("id", id);
  if (!error) await sb.from("tasks").update({ due_at: new Date(when + "T17:00:00").toISOString(), updated_at: new Date().toISOString() }).eq("origin_kind", "claim").eq("origin_ref", id).then(() => {}, () => {});
  revalidatePath("/claims"); revalidatePath("/tasks");
  return { ok: !error };
}
