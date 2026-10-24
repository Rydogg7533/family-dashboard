"use server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Overland tokens are credentials, so the table (device_tokens) is closed to browsers (migration 0031). These two actions run on the server:
// they check who is signed in with the Auth server, then use the service role for that person's own rows only.
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

// Makes a new token for the signed-in person's phone and returns it ONCE (it is not shown again on the page).
export async function issueOverlandToken(label: string) {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false as const, error: "Not available in sample mode." };
  const u = await me(); if (!u) return { ok: false as const, error: "Sign in again." };
  const name = String(label || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || `${u.name} iPhone`;
  const svc = service();
  const { data: active } = await svc.from("device_tokens").select("id").eq("kind", "overland").eq("person", u.id).is("revoked_at", null);
  if ((active?.length ?? 0) >= MAX_ACTIVE) return { ok: false as const, error: "You already have 5 active tokens. Stop one first." };
  const token = randomBytes(32).toString("base64url");
  const { error } = await svc.from("device_tokens").insert({ kind: "overland", label: name, person: u.id, token, home_network_only: false });
  if (error) { console.error("issueOverlandToken:", error.code, error.message); return { ok: false as const, error: "Could not make a token. Try again." }; }
  await u.sb.from("activity_log").insert({ actor: u.name, action: "overland_token_issued", subject: `${u.name} made a location token for "${name}"`, undoable: false }).then(() => {}, () => {});
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return { ok: true as const, token, endpoint: `https://${host}/api/location/overland` };
}

// Stops one of the person's own tokens (sets revoked_at; the row is kept).
export async function stopOverlandToken(id: string) {
  if (!UUID.test(id)) return { ok: false as const, error: "Unknown token." };
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false as const, error: "Not available in sample mode." };
  const u = await me(); if (!u) return { ok: false as const, error: "Sign in again." };
  const { data, error } = await service().from("device_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("person", u.id).eq("kind", "overland").is("revoked_at", null).select("label");
  if (error || !data?.length) return { ok: false as const, error: "Could not stop that token." };
  await u.sb.from("activity_log").insert({ actor: u.name, action: "overland_token_stopped", subject: `${u.name} stopped the location token "${data[0].label}"`, undoable: false }).then(() => {}, () => {});
  return { ok: true as const };
}
