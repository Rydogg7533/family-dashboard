import { getMyProfile, hasSupabaseEnv } from "@/lib/supabase/server";
// True when the signed-in person is a parent with the owner role. Controls only whether edit buttons show; the server actions check again.
export async function isOwnerViewer(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const data = await getMyProfile();
  return data?.role === "owner";
}
