"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Queues a line for the person's own Mac to send through Messages as them (F16). The dashboard never sends anything itself.
export async function sendLine(threadId: string, text: string) {
  const t = text.trim();
  if (!t) return { ok: false, error: "Nothing to send." };
  if (!hasSupabaseEnv()) return { ok: true, sample: true, id: `s${Date.now()}` };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: thread } = await sb.from("messages_threads").select("id,name").eq("id", threadId).maybeSingle();
  if (!thread) return { ok: false, error: "This thread is not mirrored." };
  const { data, error } = await sb.from("messages_outbox").insert({ person: user.id, thread_id: threadId, text: t.slice(0, 4000) }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not queue it." };
  revalidatePath(`/messages/${threadId}`);
  return { ok: true, id: data.id as string };
}

// Lines still waiting to be sent, so the thread can show them as "sending…".
export async function pendingLines(threadId: string) {
  if (!hasSupabaseEnv()) return [] as { id: string; text: string; status: string; error: string | null; queued_at: string }[];
  const sb = await createClient();
  const { data } = await sb.from("messages_outbox").select("id,text,status,error,queued_at").eq("thread_id", threadId).neq("status", "sent").gte("queued_at", new Date(Date.now() - 10 * 60_000).toISOString()).order("queued_at"); // a failure note shows for 10 minutes, then the thread speaks for itself
  return (data ?? []) as { id: string; text: string; status: string; error: string | null; queued_at: string }[];
}

// Opening a thread is seeing its replies: clears the Messages badge for that thread on every device.
export async function markThreadSeen(threadId: string) {
  if (!hasSupabaseEnv()) return;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from("notifications").update({ dismissed_at: new Date().toISOString() })
    .eq("person", user.id).eq("type", "message").eq("url", `/messages/${threadId}`).is("dismissed_at", null);
}

// A chip was tapped. "task" creates the task here (with the line as its origin); "calendar", "reply" and "receipt" are
// finished by the caller (calendar form, sendLine, receipts) after this records the outcome. Either way the bar moves.
export async function takeSuggestion(id: string) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: s } = await sb.from("message_suggestions").select("id,kind,title,payload,thread_id,message_id").eq("id", id).eq("person", user.id).maybeSingle();
  if (!s) return { ok: false, error: "That suggestion is gone." };
  let taskId: string | null = null;
  if (s.kind === "task") {
    const p = (s.payload ?? {}) as { title?: string; due_at?: string | null; for?: string | null };
    const { data: thread } = await sb.from("messages_threads").select("name").eq("id", s.thread_id).maybeSingle();
    const { data: t, error } = await sb.from("tasks").insert({ person: user.id, audience: "one", fyi: [], kind: "do", title: (p.title || s.title || "").slice(0, 200),
      summary: `From ${thread?.name ?? "a text"} thread · suggested by the assistant, created by you`, origin_kind: "message", origin_ref: s.message_id, due_at: p.due_at || null, tier: 2, status: "open" }).select("id").single();
    if (error) return { ok: false, error: error.message };
    taskId = t?.id ?? null;
  }
  const { error } = await sb.rpc("suggestion_outcome", { sid: id, outcome: "taken" });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/messages/${s.thread_id}`);
  return { ok: true, kind: s.kind as string, taskId, payload: (s.payload ?? {}) as Record<string, unknown>, threadId: s.thread_id as string };
}
export async function ignoreSuggestion(id: string) {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { error } = await sb.rpc("suggestion_outcome", { sid: id, outcome: "ignored" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
