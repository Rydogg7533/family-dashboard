import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Possible subscriptions the mail agent found (subscription_candidates, migration 0015). A person answers each once.
export type Cycle = "weekly" | "monthly" | "yearly";
export type Candidate = {
  id: string; merchant_key: string; name: string; address: string | null; domain: string | null; mailbox: string | null;
  task_merge_key: string | null; receipt_count: number; first_seen: string | null; last_seen: string | null;
  amount_hint: number | null; cycle_hint: Cycle | null; status: "asking" | "subscription" | "not_subscription";
};

const sampleCandidates: Candidate[] = [
  { id: "c1", merchant_key: "sample", name: "[Software service]", address: "billing@[service].example", domain: "[service].example", mailbox: "you@example.com", task_merge_key: null, receipt_count: 6, first_seen: "2026-05-04", last_seen: "2026-10-05", amount_hint: 20, cycle_hint: "monthly", status: "asking" },
];

export async function getCandidates(): Promise<Candidate[]> {
  if (!hasSupabaseEnv()) return sampleCandidates;
  const sb = await createClient();
  const { data } = await sb.from("subscription_candidates").select("*").eq("status", "asking").order("receipt_count", { ascending: false });
  return (data as Candidate[]) ?? [];
}

// The candidate behind a "Subscription?" task, whatever its answer (so the task page can show the form or the result).
export async function getCandidateForTask(taskId: string): Promise<Candidate | null> {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: t } = await sb.from("tasks").select("merge_key").eq("id", taskId).maybeSingle();
  if (!t?.merge_key) return null;
  const { data } = await sb.from("subscription_candidates").select("*").eq("task_merge_key", t.merge_key).maybeSingle();
  return (data as Candidate) ?? null;
}
