"use server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type ChangePasswordResult = { ok: boolean; error?: string; sample?: boolean };

const MIN_LENGTH = 10;

// Replaces the signed-in person's own password. Verifies the current (temporary) password first on a
// throwaway client that never touches the session cookies, then updates through the person's own session.
// Passwords are never logged or stored by the dashboard; the log line records only that a change happened.
export async function changePassword(current: string, next: string, confirm: string): Promise<ChangePasswordResult> {
  if (!current || !next || !confirm) return { ok: false, error: "Fill in all three boxes." };
  if (next !== confirm) return { ok: false, error: "The new password and the confirmation do not match." };
  if (next.length < MIN_LENGTH) return { ok: false, error: `Use at least ${MIN_LENGTH} characters.` };
  if (next === current) return { ok: false, error: "Choose a password different from the current one." };
  if (!hasSupabaseEnv()) return { ok: true, sample: true };

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !user.email) return { ok: false, error: "You are not signed in." };

  const verifier = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const check = await verifier.auth.signInWithPassword({ email: user.email, password: current });
  if (check.error) return { ok: false, error: "The current password is not right." };

  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return { ok: false, error: error.message };

  const { data: profile } = await sb.from("profiles").select("display_name").eq("id", user.id).single();
  await sb.from("activity_log").insert({ actor: profile?.display_name ?? "Member", action: "password_changed", subject: "Changed own password", undoable: false }).then(() => {}, () => {});
  return { ok: true };
}
