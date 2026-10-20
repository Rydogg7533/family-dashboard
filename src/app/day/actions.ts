"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// "Questions for you" (F3): the person taps a suggestion or types a name. The stop is marked answered under the
// person's own session (RLS: owner only); the Mac mini location-agent turns the answer into a Place and a day block
// on its next run, and never asks about that Place again. Nothing here calls a model.
export async function answerStop(stopId: string, answer: string): Promise<{ ok: boolean; error?: string }> {
  const text = (answer || "").trim().slice(0, 80);
  if (!text) return { ok: false, error: "Say what it was, or tap Skip." };
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { error } = await sb.from("location_stops").update({ status: "answered", answer: text, updated_at: new Date().toISOString() }).eq("id", stopId).eq("status", "question");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
