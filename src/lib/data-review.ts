import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Task } from "@/lib/data";
import { getCandidates, type Candidate } from "@/lib/data-subscriptions";

export type Review = {
  stale: Task[];                            // open, overdue by more than a week
  asking: Candidate[];                      // subscription candidates nobody has answered
  split: { who: string; n: number }[];      // tasks finished in the last seven days, by who finished them
  doneThisWeek: number;
  lastConfirmed: { at: string; by: string } | null;
};

// The week's open loops. Not a dashboard of the week: a short list of what the system has been holding,
// each settled with one tap. Six places in the app promised this page before it existed (decisions log
// 2026-10-26h, D99). Sections are added as the things that feed them come to exist -- unclassified
// documents and "what went to Other" are next. There is deliberately no "rules to approve" section yet:
// the only rules table with a reader is filing_rules, and its rules are active the moment they are made.
export async function getReview(): Promise<Review> {
  if (!hasSupabaseEnv()) return { stale: [], asking: [], split: [], doneThisWeek: 0, lastConfirmed: null };
  const sb = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [stale, asking, done, confirmed] = await Promise.all([
    sb.from("tasks").select("*").eq("status", "open").lt("due_at", weekAgo).order("due_at", { ascending: true }).limit(50),
    getCandidates(),
    sb.from("tasks").select("done_by").eq("status", "done").gte("updated_at", weekAgo),
    sb.from("activity_log").select("actor, at").eq("action", "week_confirmed").order("at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const by = new Map<string, number>();
  for (const r of done.data ?? []) { const w = String(r.done_by ?? "").trim() || "Unknown"; by.set(w, (by.get(w) ?? 0) + 1); }
  return {
    stale: ((stale.data ?? []) as Task[]),
    asking: asking.filter((c) => c.status === "asking"),
    split: [...by].map(([who, n]) => ({ who, n })).sort((a, b) => b.n - a.n),
    doneThisWeek: (done.data ?? []).length,
    lastConfirmed: confirmed.data ? { at: String(confirmed.data.at), by: String(confirmed.data.actor) } : null,
  };
}
