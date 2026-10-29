"use server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Capture tokens are credentials, so device_tokens is closed to browsers (migration 0031). Same shape as the Overland
// actions: check who is signed in, then use the service role for that person's own rows only.
const service = () => createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACTIVE = 5;

async function me() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { sb, id: user.id, name: prof?.display_name ?? user.email ?? "member" };
}

// A new token for the signed-in person's phone, returned ONCE.
export async function issueCaptureToken(label: string) {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false as const, error: "Not available in sample mode." };
  const u = await me(); if (!u) return { ok: false as const, error: "Sign in again." };
  const name = String(label || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || `${u.name}'s iPhone`;
  const svc = service();
  const { data: active } = await svc.from("device_tokens").select("id").eq("kind", "capture").eq("person", u.id).is("revoked_at", null);
  if ((active?.length ?? 0) >= MAX_ACTIVE) return { ok: false as const, error: "You already have 5 active camera tokens. Stop one first." };
  const token = randomBytes(32).toString("base64url");
  const { error } = await svc.from("device_tokens").insert({ kind: "capture", label: name, person: u.id, token, home_network_only: false });
  if (error) { console.error("issueCaptureToken:", error.code, error.message); return { ok: false as const, error: "Could not make a token. Try again." }; }
  await u.sb.from("activity_log").insert({ actor: u.name, action: "capture_token_issued", subject: `${u.name} made a camera-shortcut token for "${name}"`, undoable: false }).then(() => {}, () => {});
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return { ok: true as const, token, endpoint: `https://${host}/api/capture/shortcut` };
}

// Stops one of the person's own tokens (sets revoked_at; the row is kept).
export async function stopCaptureToken(id: string) {
  if (!UUID.test(id)) return { ok: false as const, error: "Unknown token." };
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false as const, error: "Not available in sample mode." };
  const u = await me(); if (!u) return { ok: false as const, error: "Sign in again." };
  const { data, error } = await service().from("device_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("person", u.id).eq("kind", "capture").is("revoked_at", null).select("label");
  if (error || !data?.length) return { ok: false as const, error: "Could not stop that token." };
  await u.sb.from("activity_log").insert({ actor: u.name, action: "capture_token_stopped", subject: `${u.name} stopped the camera-shortcut token "${data[0].label}"`, undoable: false }).then(() => {}, () => {});
  return { ok: true as const };
}
