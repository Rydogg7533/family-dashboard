"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Scope, Verdict } from "@/lib/data-review";

// Judging an email-made task. Writes one task_reviews row and NOTHING else: not the task's status
// (the queue stays as the person left it) and not activity_log. The log is for what the system did on
// its own (F12.10); this is a person marking up the system's work, and the row already carries who
// and when, so a log line beside it would be 50-odd rows of duplicate noise.
//
// Re-tappable: the task is the primary key, so a second answer replaces the first. A fresh verdict
// resets scope to 'once', since "wrong every time" said about one reading of the task should not
// survive the person changing their mind about what the task was.
export async function recordTriageVerdict(taskId: string, verdict: Verdict, scope: Scope = "once") {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { error } = await sb.from("task_reviews").upsert({
    task: taskId,
    verdict,
    scope: verdict === "right" ? "once" : scope,
    reviewed_by: user.id,
    reviewed_by_name: me?.display_name ?? user.email ?? "member",
    at: new Date().toISOString(),
  }, { onConflict: "task" });
  if (error) return { ok: false, error: "Could not save that." };
  revalidatePath("/review");
  return { ok: true };
}

// Confirming the week writes one log row and nothing else. The sections above it are settled by their own
// actions (setTaskStatus, the subscription answer); this is the record that someone looked, with the count
// of what they left open. It is not a lock: anything still open stays on the list.
export async function confirmWeek(open: number) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = me?.display_name ?? user.email ?? "member";
  const subject = open ? `${who} confirmed the week with ${open} item${open === 1 ? "" : "s"} still open` : `${who} confirmed the week`;
  const { error } = await sb.from("activity_log").insert({ actor: who, action: "week_confirmed", subject, undoable: false });
  if (error) return { ok: false, error: "Could not record it." };
  revalidatePath("/review"); revalidatePath("/");
  return { ok: true };
}
