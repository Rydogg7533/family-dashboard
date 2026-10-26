"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Put a finished task back on the list. setTaskStatus has always logged these as undoable; nothing
// read that flag until now. The money routine CAN see evidence and marks its own work done_by
// "System"; those are labelled as such rather than hidden, because even a machine reading can be
// about the wrong row.
export async function undoTaskStatus(id: string) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = me?.display_name ?? user.email ?? "member";
  const { data, error } = await sb.from("tasks")
    .update({ status: "open", done_by: null, updated_at: new Date().toISOString() })
    .eq("id", id).in("status", ["done", "dismissed"]).select("id,title");
  if (error || !data?.length) return { ok: false, error: "You can't put that one back. It belongs to someone else." };
  await sb.from("activity_log").insert({ actor: who, action: "task_reopened", subject: `${who} put back: ${String(data[0].title).slice(0, 80)}`, ref: id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/tasks"); revalidatePath("/");
  return { ok: true };
}

export async function setTaskStatus(id: string, status: "done" | "snoozed" | "dismissed") {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = me?.display_name ?? user.email ?? "member";
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status !== "snoozed") patch.done_by = who;
  if (status === "snoozed") patch.snoozed_until = new Date(Date.now() + 24 * 3600_000).toISOString();
  // select() so a task the person is not allowed to change reports failure instead of silently doing nothing
  const { data, error } = await sb.from("tasks").update(patch).eq("id", id).select("id,title,audience");
  if (error || !data?.length) return { ok: false, error: "You can't change this one. It belongs to someone else." };
  await sb.from("activity_log").insert({ actor: who, action: `task_${status}`, subject: `${who} ${status === "done" ? "handled" : status}: ${String(data[0].title).slice(0, 80)}`, ref: id, undoable: true }).then(() => {}, () => {});
  revalidatePath("/tasks"); revalidatePath("/");
  return { ok: true };
}

// Who a task is for: "me", "other", "both" (either may finish it; it closes for both), plus an optional heads-up to the other person.
export async function setTaskWho(id: string, mode: "me" | "other" | "both", headsUp: boolean) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: people } = await sb.from("profiles").select("id");
  const other = (people ?? []).map((p) => p.id as string).find((x) => x !== user.id);
  if (!other) return { ok: false, error: "No second person is set up." };
  const patch = mode === "both" ? { person: user.id, audience: "both", fyi: [] as string[] }
    : mode === "me" ? { person: user.id, audience: "one", fyi: headsUp ? [other] : [] }
    : { person: other, audience: "one", fyi: headsUp ? [user.id] : [] };
  const { data, error } = await sb.from("tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "You can't change this one." };
  revalidatePath("/tasks"); revalidatePath("/");
  return { ok: true };
}

// A heads-up copy becomes yours.
export async function takeTask(id: string) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: t } = await sb.from("tasks").select("fyi").eq("id", id).maybeSingle();
  const { data, error } = await sb.from("tasks").update({ person: user.id, audience: "one", fyi: ((t?.fyi as string[] | null) ?? []).filter((x) => x !== user.id), updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Could not take it." };
  revalidatePath("/tasks"); revalidatePath("/");
  return { ok: true };
}
