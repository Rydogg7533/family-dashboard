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
