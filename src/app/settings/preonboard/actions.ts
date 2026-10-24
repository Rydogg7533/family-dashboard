"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { isOwnerViewer } from "@/lib/owner";
import { newToken, hashToken } from "@/lib/pin";

type Res = { ok: boolean; error?: string; link?: string };
const UUID = /^[0-9a-f-]{36}$/i;

async function who() {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  return { sb, actor: user.email ?? "member" };
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

export async function createPreonboardLink(label: string): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in." };
  if (!(await isOwnerViewer())) return { ok: false, error: "Only a parent can create these links." };
  const token = newToken();
  const { error } = await w.sb.from("preonboard_links").insert({ token_hash: hashToken(token), label: label.trim().slice(0, 120), created_by: w.actor });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/preonboard");
  return { ok: true, link: `${siteUrl()}/preonboard/${token}` };
}

export async function revokePreonboardLink(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown link." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in." };
  if (!(await isOwnerViewer())) return { ok: false, error: "Only a parent can revoke these links." };
  const { error } = await w.sb.from("preonboard_links").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/preonboard");
  return { ok: true };
}
