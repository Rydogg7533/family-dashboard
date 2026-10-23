import "server-only";
// The Assistant feed (D73). Best-effort bookkeeping: a failure here never blocks what the person asked for.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type FeedStatus = "needs_you" | "done" | "declined" | "failed" | "superseded" | "info";
export type FeedRow = { id: string; at: string; source: string; kind: string; status: FeedStatus; title: string; detail: string | null; actor: string; thread_key: string | null; link: string | null };

async function me() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, email: user?.email ?? null };
}
export const threadKeyOf = (firstUserText: string) => firstUserText.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);

// A new proposal replaces the open one from the same conversation, so edits don't pile up as separate asks.
export async function feedPropose(p: { source: string; kind?: FeedRow["kind"]; title: string; detail?: string; threadKey: string; link?: string }): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const { sb, email } = await me();
    if (!email) return null;
    await sb.from("assistant_feed").update({ status: "superseded", decided_at: new Date().toISOString(), decided_by: "assistant" }).eq("status", "needs_you").eq("thread_key", p.threadKey).eq("actor", email);
    const { data } = await sb.from("assistant_feed").insert({ source: p.source, kind: p.kind ?? "proposal", status: "needs_you", title: p.title.slice(0, 200), detail: p.detail?.slice(0, 300) ?? null, actor: email, thread_key: p.threadKey, link: p.link ?? null }).select("id").single();
    return (data?.id as string) ?? null;
  } catch { return null; }
}
export async function feedResolve(id: string | null | undefined, status: FeedStatus, detail?: string, link?: string) {
  if (!id || !hasSupabaseEnv()) return;
  try {
    const { sb, email } = await me();
    await sb.from("assistant_feed").update({ status, decided_at: new Date().toISOString(), decided_by: email ?? "member", ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(link ? { link } : {}) }).eq("id", id);
  } catch { /* bookkeeping only */ }
}
export async function feedDeclineThread(threadKey: string) {
  if (!hasSupabaseEnv()) return;
  try {
    const { sb, email } = await me();
    if (!email) return;
    await sb.from("assistant_feed").update({ status: "declined", decided_at: new Date().toISOString(), decided_by: email }).eq("status", "needs_you").eq("thread_key", threadKey).eq("actor", email);
  } catch { /* bookkeeping only */ }
}
export async function getFeed(limit = 150): Promise<{ rows: FeedRow[]; inbox: { id: string; title: string; missing: string; captured_at: string; requested_by: string }[] }> {
  if (!hasSupabaseEnv()) return { rows: [], inbox: [] };
  const sb = await createClient();
  const [f, i] = await Promise.all([
    sb.from("assistant_feed").select("*").order("at", { ascending: false }).limit(limit),
    sb.from("inbox_items").select("id,title,missing,captured_at,requested_by").eq("status", "open").order("captured_at", { ascending: false }).limit(30),
  ]);
  return { rows: (f.data as FeedRow[]) ?? [], inbox: (i.data as never[]) ?? [] };
}
