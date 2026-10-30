"use server";
// Statements: the two things the browser may do. Record an upload it just stored, and say which account and month an upload belongs to.
// Everything else (reading the file, matching the account, the arithmetic) happens on the Mac mini. Owners only, checked here and again by RLS.
// No model is called on this path.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; reason: string };
const OK_MIME = ["application/pdf", "image/jpeg", "image/png"];

async function owner() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return prof?.role === "owner" ? { sb, user } : null;
}

export async function registerStatement(input: { path: string; name: string; mime: string; size: number; sha256: string | null }): Promise<Result> {
  if (!hasSupabaseEnv()) return { ok: true };
  const o = await owner();
  if (!o) return { ok: false, reason: "Only a household owner can upload statements." };
  if (!input.path.startsWith(`${o.user.id}/`) || input.path.includes("..")) return { ok: false, reason: "That file is not in your folder." };
  if (!OK_MIME.includes(input.mime)) return { ok: false, reason: "Only PDF, JPG or PNG files can be read." };
  const { error } = await o.sb.from("statement_uploads").insert({
    uploaded_by: o.user.id, file_path: input.path, original_name: String(input.name).slice(0, 200), mime: input.mime,
    size_bytes: Number.isFinite(input.size) ? input.size : null, sha256: input.sha256 && /^[0-9a-f]{64}$/.test(input.sha256) ? input.sha256 : null,
  });
  if (error) return { ok: false, reason: error.code === "23505" ? "That file was already added." : "Could not record the upload." };
  revalidatePath("/money/statements");
  return { ok: true };
}

// The reader could not tell the account or the month from the statement, so an owner says. The Mac mini finishes the filing on its next run.
export async function assignStatement(id: string, accountId: string, period: string): Promise<Result> {
  if (!hasSupabaseEnv()) return { ok: true };
  const o = await owner();
  if (!o) return { ok: false, reason: "Only a household owner can do this." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return { ok: false, reason: "Write the month as YYYY-MM, for example 2026-10." };
  if (!accountId) return { ok: false, reason: "Choose the account." };
  const { data, error } = await o.sb.from("statement_uploads").update({ account_id: accountId, period }).eq("id", id).eq("status", "needs_account").select("id");
  if (error || !data?.length) return { ok: false, reason: "Could not save that. It may already be filed." };
  revalidatePath("/money/statements");
  return { ok: true };
}
