import { createClient, getRequestUser, hasSupabaseEnv } from "@/lib/supabase/server";
// True when the signed-in person is a parent with the owner role. Controls only whether edit buttons show; the server actions check again.
export async function isOwnerViewer(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const u = await getRequestUser(); if (!u) return false;
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("role").eq("id", u.id).maybeSingle();
  return data?.role === "owner";
}
