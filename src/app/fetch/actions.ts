"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Ask a file off the hub (D104). The path is the one a register row carries; the hub's fetcher reads it
// under its Organized tree and refuses anything outside it. Returns the request id the page polls.
export async function requestFetch(path: string, register?: string, ref?: string): Promise<{ ok: true; id: string; reused: boolean } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Not available in preview." };
  const p = path.replace(/^.*\/Organized\//, "Organized/").trim();
  if (!p.startsWith("Organized/") || p.includes("..")) return { ok: false, error: "That is not a path on the hub." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  // A copy fetched in the last day is reused; the same paper is not pulled twice.
  const { data: had } = await sb.from("fetch_requests").select("id").eq("path", p).not("delivered_at", "is", null).gt("expires_at", new Date().toISOString()).order("delivered_at", { ascending: false }).limit(1).maybeSingle();
  if (had) return { ok: true, id: had.id as string, reused: true };
  const { data, error } = await sb.from("fetch_requests").insert({ path: p, register: register ?? null, ref: ref ?? null, requested_by: user.id }).select("id").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string, reused: false };
}

export async function fetchStatus(id: string): Promise<{ state: "waiting" | "picked" | "ready" | "error"; error?: string }> {
  if (!hasSupabaseEnv()) return { state: "error", error: "Not available in preview." };
  const sb = await createClient();
  const { data } = await sb.from("fetch_requests").select("picked_at, delivered_at, error").eq("id", id).maybeSingle();
  if (!data) return { state: "error", error: "No such request." };
  if (data.error) return { state: "error", error: String(data.error) };
  if (data.delivered_at) return { state: "ready" };
  return { state: data.picked_at ? "picked" : "waiting" };
}
