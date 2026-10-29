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

// Pin or unpin a conversation for the signed-in person (profiles.pinned_threads, in pin order).
export async function togglePin(threadId: string) {
  if (!hasSupabaseEnv()) return { ok: true, pinned: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: prof } = await sb.from("profiles").select("pinned_threads").eq("id", user.id).maybeSingle();
  const cur = (prof?.pinned_threads as string[] | null) ?? [];
  const next = cur.includes(threadId) ? cur.filter((x) => x !== threadId) : [...cur, threadId].slice(-6); // six is where the row stops fitting
  const { error } = await sb.from("profiles").update({ pinned_threads: next }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/messages"); revalidatePath(`/messages/${threadId}`);
  return { ok: true, pinned: next.includes(threadId) };
}

// The two per-thread switches: hidden (not shown here) and assistant_reads (the suggestion engine may read it).
export async function setThreadSwitch(threadId: string, patch: { hidden?: boolean; assistant_reads?: boolean }) {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await sb.from("messages_threads").update(patch).eq("id", threadId).eq("person", user.id);
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "thread_switch", subject: `${threadId}: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")}`, undoable: false }).then(() => {}, () => {});
  revalidatePath("/messages"); revalidatePath(`/messages/${threadId}`);
  return { ok: true };
}

// Start a conversation with someone who has no thread in the window: the line goes out to their phone or email,
// and the thread appears here on the mirror's next pass.
export async function startThread(toHandle: string, text: string) {
  const t = text.trim(), h = toHandle.trim();
  if (!t || !h) return { ok: false, error: "Who, and what to say?" };
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await sb.from("messages_outbox").insert({ person: user.id, thread_id: null, to_handle: h, text: t.slice(0, 4000) });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Searches are server actions so client components (search field, new-message picker) can call them.
// Search: thread names and message text (the mirror's copy; a database query, no model). Returns matching thread ids
// with the line that matched, newest first.
export async function searchMessages(q: string): Promise<{ thread_id: string; text: string; at: string }[]> {
  const t = q.trim();
  if (!hasSupabaseEnv() || t.length < 2) return [];
  const sb = await createClient();
  const { data } = await sb.from("messages").select("thread_id,text,at").ilike("text", `%${t.replace(/[%_]/g, "\\$&")}%`).order("at", { ascending: false }).limit(60);
  const seen = new Set<string>(); const out: { thread_id: string; text: string; at: string }[] = [];
  for (const r of data ?? []) { if (seen.has(r.thread_id)) continue; seen.add(r.thread_id); out.push({ thread_id: String(r.thread_id), text: String(r.text ?? ""), at: String(r.at) }); }
  return out;
}

export type ContactHit = { id: string; name: string; handles: { label: string; value: string }[]; photo: string | null };
export async function searchContacts(q: string): Promise<ContactHit[]> {
  const t = q.trim();
  if (!hasSupabaseEnv() || t.length < 2) return [];
  const sb = await createClient();
  const { data } = await sb.from("contact_cards").select("id,full_name,phones,emails,photo_path").is("deleted_at", null).ilike("full_name", `%${t.replace(/[%_]/g, "\\$&")}%`).order("full_name").limit(12);
  return (data ?? []).map((c) => ({ id: String(c.id), name: String(c.full_name), photo: c.photo_path ? `/api/avatar/${c.photo_path}` : null,
    handles: [...((c.phones as { label: string; number: string }[]) ?? []).map((p) => ({ label: p.label, value: p.number })), ...((c.emails as { label: string; address: string }[]) ?? []).map((e) => ({ label: e.label, value: e.address }))] }))
    .filter((c) => c.handles.length);
}
