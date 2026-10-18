"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function setTaskStatus(id: string, status: "done" | "snoozed" | "dismissed") {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "snoozed") patch.snoozed_until = new Date(Date.now() + 24 * 3600_000).toISOString();
  const { error } = await sb.from("tasks").update(patch).eq("id", id);
  if (!error) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: `task_${status}`, subject: id, undoable: true }).then(() => {}, () => {});
  return { ok: !error };
}
