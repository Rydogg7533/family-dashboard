"use server";
import { todayIso } from "@/lib/google-calendar";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/setup-state";
import { hashToken, isPin, weakPin, pinPassword } from "@/lib/pin";
import { loginAllowed } from "@/lib/children";

type Invite = { id: string; child_id: string; email: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };
async function lookup(token: string) {
  const svc = serviceClient(); if (!svc || !token || token.length > 80) return null;
  const { data } = await svc.from("child_invites").select("id,child_id,email,expires_at,accepted_at,revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  return { svc, inv: data as Invite | null };
}

// What the join page shows before the child does anything: their name, or why the link no longer works. Never the email or the token.
export async function inviteInfo(token: string): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const r = await lookup(token); if (!r) return { ok: false, reason: "This link is not valid." };
  const { svc, inv } = r;
  if (!inv) return { ok: false, reason: "This link is not valid." };
  if (inv.revoked_at) return { ok: false, reason: "This invite was cancelled. Ask a parent for a new one." };
  if (inv.accepted_at) return { ok: false, reason: "This invite was already used. Sign in instead." };
  if (new Date(inv.expires_at) < new Date()) return { ok: false, reason: "This invite has expired. Ask a parent for a new one." };
  const { data: c } = await svc.from("children").select("display_name,profile_id").eq("id", inv.child_id).maybeSingle();
  if (!c || c.profile_id) return { ok: false, reason: "This login was already set up. Sign in instead." };
  return { ok: true, name: c.display_name };
}

// The child picked a PIN: make their login (password derived from the PIN), link it, mark the invite used, sign them in on this device.
export async function acceptInvite(token: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPin(pin)) return { ok: false, error: "A PIN is 6 digits." };
  if (weakPin(pin)) return { ok: false, error: "That one is too easy to guess. Try different digits." };
  const r = await lookup(token); if (!r || !r.inv) return { ok: false, error: "This link is not valid." };
  const { svc, inv } = r;
  if (inv.revoked_at || inv.accepted_at || new Date(inv.expires_at) < new Date()) return { ok: false, error: "This invite can no longer be used. Ask a parent for a new one." };
  const { data: c } = await svc.from("children").select("id,display_name,birth_year,login_min_age,profile_id").eq("id", inv.child_id).maybeSingle();
  if (!c || c.profile_id) return { ok: false, error: "This login was already set up." };
  const { data: hh } = await svc.from("household").select("child_login_min_age").eq("id", 1).maybeSingle();
  if (!loginAllowed(c, Number(hh?.child_login_min_age ?? 10), await todayIso())) return { ok: false, error: "A parent needs to allow a login for you first." };
  // Claim the invite first so the same link cannot be used twice at once.
  const { data: claimed } = await svc.from("child_invites").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id).is("accepted_at", null).is("revoked_at", null).select("id");
  if (!claimed?.length) return { ok: false, error: "This invite was just used. Sign in instead." };
  const password = pinPassword(inv.email, pin);
  const { data: u, error } = await svc.auth.admin.createUser({ email: inv.email, password, email_confirm: true, user_metadata: { display_name: c.display_name, pin_login: true } });
  if (error || !u.user) { await svc.from("child_invites").update({ accepted_at: null }).eq("id", inv.id); return { ok: false, error: `Could not make the login: ${error?.message ?? "unknown error"}. Ask a parent for help.` }; }
  const { error: pe } = await svc.from("profiles").insert({ id: u.user.id, display_name: c.display_name, role: "child" });
  if (pe) return { ok: false, error: `The login was made but its profile failed: ${pe.message}. Ask a parent for help.` };
  await svc.from("children").update({ profile_id: u.user.id, pin_login: true }).eq("id", c.id);
  await svc.from("activity_log").insert({ actor: c.display_name, action: "child_joined", subject: `${c.display_name} set up their own login with a PIN`, undoable: false }).then(() => {}, () => {});
  const sb = await createClient();
  const { error: se } = await sb.auth.signInWithPassword({ email: inv.email, password });
  if (se) return { ok: false, error: "Your login is ready, but signing in failed. Go to Sign in and use your name and PIN." };
  (await cookies()).set("kid_name", c.display_name, { httpOnly: false, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}
