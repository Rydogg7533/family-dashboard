"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type AssistantPrefs = { assistant_app: string | null; assistant_url: string | null; voice_enabled: boolean; voice_name: string | null; wake_word: string | null };
const EMPTY: AssistantPrefs = { assistant_app: null, assistant_url: null, voice_enabled: true, voice_name: null, wake_word: null };

export async function getAssistantPrefs(): Promise<AssistantPrefs> {
  if (!hasSupabaseEnv()) return EMPTY;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return EMPTY;
  const { data } = await sb.from("profiles").select("assistant_app, assistant_url, voice_enabled, voice_name, wake_word").eq("id", user.id).maybeSingle();
  return data ? { ...EMPTY, ...data } : EMPTY;
}

// Own row only (migration 0081 policy); logged so a changed wake word or app is findable.
export async function saveAssistantPrefs(p: Partial<AssistantPrefs>): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const clean: Partial<AssistantPrefs> = {};
  if ("assistant_app" in p) clean.assistant_app = p.assistant_app && /^(claude|chatgpt|gemini|other|none)$/.test(p.assistant_app) ? p.assistant_app : null;
  if ("assistant_url" in p) clean.assistant_url = p.assistant_url?.trim().slice(0, 300) || null;
  if ("voice_enabled" in p) clean.voice_enabled = !!p.voice_enabled;
  if ("voice_name" in p) clean.voice_name = p.voice_name && /^[a-z]{2,20}$/.test(p.voice_name) ? p.voice_name : null;
  if ("wake_word" in p) clean.wake_word = p.wake_word?.trim().replace(/\s+/g, " ").slice(0, 40) || null;
  const { error } = await sb.from("profiles").update(clean).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "assistant_prefs", subject: Object.keys(clean).join(", "), undoable: false }).then(() => {}, () => {});
  return { ok: true };
}
