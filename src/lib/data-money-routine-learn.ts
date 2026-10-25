import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { findCandidates, WATCHED, type Observation } from "@/lib/money-routine-learn";

export type CandidateRow = { key: string; label: string; months: string[]; times: number; typical_day: number | null; status: string };
export type Learning = { proposed: CandidateRow[]; watched: number; observedKinds: number; sinceMonths: number };

const denverDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date(iso));

// What the household has done, as observations: human activity-log actions (never System's) and Inbox filings by document kind.
async function observations(sb: Awaited<ReturnType<typeof createClient>>): Promise<Observation[]> {
  const out: Observation[] = [];
  const { data: acts } = await sb.from("activity_log").select("action, at, actor").not("actor", "like", "System%").limit(5000);
  for (const a of acts ?? []) { const kind = `activity:${a.action}`; if (kind in WATCHED) out.push({ kind, day: denverDay(a.at as string) }); }
  const { data: filed } = await sb.from("inbox_items").select("read_result, resolved_at, captured_at").not("filed", "is", null).limit(5000);
  for (const f of filed ?? []) { const k = (f.read_result as { kind?: string } | null)?.kind; if (!k) continue; const kind = `filed:${k}`; if (kind in WATCHED) out.push({ kind, day: denverDay((f.resolved_at ?? f.captured_at) as string) }); }
  return out;
}

// Refreshes the candidate rows from today's observations (proposed ones only; answered ones keep their answer) and returns what to show.
export async function getLearning(): Promise<Learning | null> {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const obs = await observations(sb);
  const { data: steps } = await sb.from("money_routine_steps").select("key").is("retired_at", null);
  const { data: existing } = await sb.from("money_routine_candidates").select("key, status");
  const answered = new Set((existing ?? []).filter((c) => c.status !== "proposed").map((c) => c.key as string));
  const found = findCandidates(obs, (steps ?? []).map((s) => s.key as string)).filter((c) => !answered.has(c.key));
  if (found.length) await sb.from("money_routine_candidates").upsert(found.map((c) => ({ key: c.key, label: c.label, months: c.months, times: c.times, typical_day: c.typical_day, status: "proposed", updated_at: new Date().toISOString() })), { onConflict: "key" }).then(() => {}, () => {});
  const { data: rows } = await sb.from("money_routine_candidates").select("key,label,months,times,typical_day,status").eq("status", "proposed").order("times", { ascending: false });
  const months = new Set(obs.map((o) => o.day.slice(0, 7)));
  return { proposed: (rows ?? []) as CandidateRow[], watched: Object.keys(WATCHED).length, observedKinds: new Set(obs.map((o) => o.kind)).size, sinceMonths: months.size };
}
