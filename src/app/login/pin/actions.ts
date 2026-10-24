"use server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/setup-state";
import { isPin, pinPassword, pinAttempt, pinFailed, pinCleared } from "@/lib/pin";

// Children sign in with their first name and 6-digit PIN. The name picks the child; the PIN becomes the derived password; the auth service checks it.
// Wrong PINs are counted per child here (6 in 15 minutes locks it on this server), and the auth service has its own limits on top.
export async function pinSignIn(name: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const n = String(name ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!n) return { ok: false, error: "Type your name." };
  if (!isPin(pin)) return { ok: false, error: "Your code is 6 numbers." };
  const svc = serviceClient(); if (!svc) return { ok: false, error: "Not available in preview." };
  const key = n.toLowerCase();
  const gate = pinAttempt(key); if (!gate.allowed) return { ok: false, error: `Too many tries. Wait ${gate.waitMin} minutes, or ask a parent.` };
  const { data: kids } = await svc.from("children").select("id,display_name,profile_id,pin_login,paused_at").is("archived_at", null).eq("pin_login", true).not("profile_id", "is", null);
  const match = (kids ?? []).filter((k) => k.display_name.toLowerCase() === key || k.display_name.toLowerCase().split(" ")[0] === key);
  const generic = "That name and code don’t match. Try again, or ask a parent.";
  if (match.length !== 1) { pinFailed(key); return { ok: false, error: match.length > 1 ? "Two kids have that name. Type your full name." : generic }; }
  const kid = match[0];
  const { data: u } = await svc.auth.admin.getUserById(kid.profile_id!);
  const email = u?.user?.email; if (!email) { pinFailed(key); return { ok: false, error: generic }; }
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email, password: pinPassword(email, pin) });
  if (error) { pinFailed(key); await svc.from("activity_log").insert({ actor: kid.display_name, action: "pin_signin_failed", subject: "Wrong PIN", undoable: false }).then(() => {}, () => {}); return { ok: false, error: generic }; }
  pinCleared(key);
  (await cookies()).set("kid_name", kid.display_name, { httpOnly: false, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}
