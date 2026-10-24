import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { hashToken } from "@/lib/pin";
import { ALL_KEYS, type Answers } from "@/lib/preonboard-shared";

// The public /preonboard/[token] page has no session, so it proves itself with the raw token and these
// helpers do the lookup with the service role (same shape as the kitchen tablet and /join flows): only
// the hash is ever stored, and the only thing matched is "does this hash exist and is it not revoked."
const service = () => createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type PreonboardSession = { id: string; answers: Answers; completedAt: string | null };

export async function loadByToken(token: string): Promise<{ found: boolean; revoked?: boolean; session?: PreonboardSession }> {
  if (!token || token.length > 128) return { found: false };
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, answers, completed_at, revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data) return { found: false };
  if (data.revoked_at) return { found: true, revoked: true };
  await svc.from("preonboard_links").update({ last_opened_at: new Date().toISOString() }).eq("id", data.id);
  return { found: true, session: { id: data.id, answers: (data.answers ?? {}) as Answers, completedAt: data.completed_at } };
}

export async function saveAnswerByToken(token: string, key: string, checked: boolean, value?: string): Promise<{ ok: boolean; error?: string }> {
  if (!ALL_KEYS.includes(key)) return { ok: false, error: "Unknown item." };
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, answers, revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return { ok: false, error: "This link isn't available." };
  const answers = { ...(data.answers ?? {}) } as Answers;
  answers[key] = { checked, value: value?.slice(0, 200), updatedAt: new Date().toISOString() };
  const { error } = await svc.from("preonboard_links").update({ answers }).eq("id", data.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markCompleteByToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, revoked_at, label").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return { ok: false, error: "This link isn't available." };
  const { error } = await svc.from("preonboard_links").update({ completed_at: new Date().toISOString() }).eq("id", data.id);
  if (error) return { ok: false, error: error.message };
  // Best-effort nudge to both parents; a failed insert here should never block the buyer's own confirmation.
  const { data: parents } = await svc.from("profiles").select("id").eq("role", "owner");
  for (const p of parents ?? []) {
    await svc.from("notifications").insert({ person: p.id, type: "other", channel: "today", title: "Pre-onboarding ready", body: `${data.label || "A household"} finished the pre-onboarding checklist.` }).then(() => {}, () => {});
  }
  return { ok: true };
}
