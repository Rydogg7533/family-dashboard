"use server";
// Server-action wrappers around the AI layer so client components never hold the key.
import { callModel, type Job, type Message, type ModelResult } from "@/lib/ai";
import { answerAsk, type AskReply, type Turn } from "@/lib/ask-engine";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function callModelAction(args: { job: Job; messages: Message[]; system?: string; feature?: string }): Promise<ModelResult> {
  return callModel(args);
}

export async function askAction(thread: Turn[], assistantApp?: string): Promise<AskReply> {
  try {
    return await answerAsk(thread, assistantApp);
  } catch (e) {
    return { kind: "inbox", text: `The model could not be reached (${(e as Error).message.slice(0, 80)}). Saved to Inbox with your words.`, source: { label: "Open in Inbox", href: "/inbox" }, cost: 0, costText: "no cost", model: "none", sample: false };
  }
}

// An Ask instruction confirmed by a tap: logged with the instruction as the source (undoable).
export async function confirmInstruction(summary: string, target: string, tier: number) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.from("activity_log").insert({ actor: user.email ?? "member", action: `ask_instruction_tier${tier}`, subject: `${summary} → ${target}`, undoable: true });
  return { ok: !error };
}

// An unanswered thread becomes an Inbox item with the whole conversation attached (F4).
export async function parkThreadInInbox(thread: Turn[]) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const first = thread.find((t) => t.role === "user")?.text ?? "Ask thread";
  const { error } = await sb.from("inbox_items").insert({
    kind: "ask_thread", requested_by: (await sb.auth.getUser()).data.user?.email ?? "member", title: `"${first.slice(0, 80)}"`, origin: "Ask", origin_href: "/ask", origin_label: "Ask",
    missing: "Is this a document, an appointment or a bill?", options: ["File a document", "Add an appointment", "Add a bill", "Something else"],
    thread: thread.map((t) => ({ at: new Date().toISOString(), who: t.role === "user" ? "you" : "assistant", text: t.text })),
  });
  return { ok: !error };
}
