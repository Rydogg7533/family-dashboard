"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { isStep } from "@/lib/connections-steps";

// "Not now" on a Today set-up card: hide that step for 7 days, then it comes back. Own row only (row-level security + column grants);
// inserts the first time and updates `until` after (an upsert would rewrite person and step, which the app has no grant to change).
export async function dismissSetupStep(step: string) {
  if (!isStep(step)) return { ok: false as const, error: "Unknown step." };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in again." };
  const now = new Date(), until = new Date(now.getTime() + 7 * 864e5).toISOString();
  const { data: cur } = await sb.from("setup_dismissals").select("step").eq("person", user.id).eq("step", step).maybeSingle();
  const { error } = cur
    ? await sb.from("setup_dismissals").update({ until, updated_at: now.toISOString() }).eq("person", user.id).eq("step", step)
    : await sb.from("setup_dismissals").insert({ person: user.id, step, until, updated_at: now.toISOString() });
  if (error) { console.error("dismissSetupStep:", error.code, error.message); return { ok: false as const, error: "Could not save. Try again." }; }
  return { ok: true as const };
}
