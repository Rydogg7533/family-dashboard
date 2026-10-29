import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Possible subscriptions the mail agent found (subscription_candidates, migration 0015). A person answers each once.
export type Cycle = "weekly" | "monthly" | "yearly";
export type Candidate = {
  id: string; merchant_key: string; name: string; address: string | null; domain: string | null; mailbox: string | null;
  task_merge_key: string | null; receipt_count: number; first_seen: string | null; last_seen: string | null;
  amount_hint: number | null; cycle_hint: Cycle | null; status: "asking" | "subscription" | "not_subscription" | "ended";
  evidence?: Evidence[];                       // what the question is asked from (issue 984d6052): newest first
};
// One sighting behind a "subscription?" question: a receipt email (with the mailbox it came to), a statement charge, a notice.
export type Evidence = { on: string; amount: number | null; source: "receipt" | "notice" | "charge" | "store_receipt" | "manual"; mailbox: string | null; signal: string };

// The card must show the evidence it is asking from -- which charges (dates, amounts) and which emails, including the
// mailbox the email arrived at (Ryan, 2026-10-27). Up to eight per candidate, newest first; the card works out the cadence.
async function withEvidence(sb: Awaited<ReturnType<typeof createClient>>, list: Candidate[]): Promise<Candidate[]> {
  const keys = list.map((c) => c.merchant_key).filter(Boolean);
  if (!keys.length) return list;
  const { data } = await sb.from("recurring_observations").select("merchant_key,observed_on,amount,source,mailbox,signal").in("merchant_key", keys).order("observed_on", { ascending: false }).limit(keys.length * 40);
  const by = new Map<string, Evidence[]>();
  for (const o of data ?? []) {
    const arr = by.get(o.merchant_key as string) ?? [];
    if (arr.length < 8) arr.push({ on: String(o.observed_on), amount: o.amount == null ? null : Number(o.amount), source: o.source as Evidence["source"], mailbox: (o.mailbox as string | null) ?? null, signal: String(o.signal) });
    by.set(o.merchant_key as string, arr);
  }
  return list.map((c) => ({ ...c, evidence: by.get(c.merchant_key) ?? [] }));
}

const sampleCandidates: Candidate[] = [
  { id: "c1", merchant_key: "sample", name: "[Software service]", address: "billing@[service].example", domain: "[service].example", mailbox: "you@example.com", task_merge_key: null, receipt_count: 6, first_seen: "2026-05-04", last_seen: "2026-10-05", amount_hint: 20, cycle_hint: "monthly", status: "asking" },
];

export async function getCandidates(): Promise<Candidate[]> {
  if (!hasSupabaseEnv()) return sampleCandidates;
  const sb = await createClient();
  const { data } = await sb.from("subscription_candidates").select("*").eq("status", "asking").order("receipt_count", { ascending: false });
  return withEvidence(sb, (data as Candidate[]) ?? []);
}

// The candidate behind a "Subscription?" task, whatever its answer (so the task page can show the form or the result).
export async function getCandidateForTask(taskId: string): Promise<Candidate | null> {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: t } = await sb.from("tasks").select("merge_key").eq("id", taskId).maybeSingle();
  if (!t?.merge_key) return null;
  const { data } = await sb.from("subscription_candidates").select("*").eq("task_merge_key", t.merge_key).maybeSingle();
  if (!data) return null;
  return (await withEvidence(sb, [data as Candidate]))[0] ?? null;
}
