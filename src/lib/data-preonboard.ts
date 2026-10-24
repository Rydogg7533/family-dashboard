import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { progress, type Answers } from "@/lib/preonboard-shared";

export type PreonboardLinkRow = {
  id: string; label: string; createdAt: string; lastOpenedAt: string | null;
  completedAt: string | null; revokedAt: string | null; done: number; total: number;
};

export async function listPreonboardLinks(): Promise<PreonboardLinkRow[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("preonboard_links").select("id,label,created_at,last_opened_at,completed_at,revoked_at,answers").order("created_at", { ascending: false });
  return (data ?? []).map((r) => {
    const p = progress((r.answers ?? {}) as Answers);
    return { id: r.id, label: r.label || "(no label)", createdAt: r.created_at, lastOpenedAt: r.last_opened_at, completedAt: r.completed_at, revokedAt: r.revoked_at, done: p.done, total: p.total };
  });
}
