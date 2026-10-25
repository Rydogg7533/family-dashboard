import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type RoutineStep = { id: string; key: string; label: string; detail: string | null; cadence: string; anchor_day: number | null; owner: string; href: string | null; source: string; sort: number };
export type RoutineRun = { id: string; period: string; step_id: string; status: "open" | "done" | "skipped"; done_by: string | null; done_at: string | null; evidence: string | null; skip_reason: string | null };
export type RoutineItem = RoutineStep & { run: RoutineRun | null; due: string; overdue: boolean };
export type Routine = { period: string; label: string; items: RoutineItem[]; done: number; total: number };

// The household's current month, in Utah time.
export function currentPeriod(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
const dueDate = (period: string, day: number | null) => { const [y, m] = period.split("-").map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${period}-${String(Math.min(day ?? last, last)).padStart(2, "0")}`; };

// This month's routine. Runs for the period are created on first read (one per live step), so the list is the same for everyone who opens it.
export async function getRoutine(period = currentPeriod()): Promise<Routine | null> {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: steps } = await sb.from("money_routine_steps").select("id,key,label,detail,cadence,anchor_day,owner,href,source,sort").is("retired_at", null).order("sort").order("key");
  const live = (steps ?? []) as RoutineStep[];
  if (!live.length) return { period, label: periodLabel(period), items: [], done: 0, total: 0 };
  const { data: have } = await sb.from("money_routine_runs").select("step_id").eq("period", period);
  const haveIds = new Set((have ?? []).map((r) => r.step_id as string));
  const missing = live.filter((s) => !haveIds.has(s.id)).map((s) => ({ period, step_id: s.id }));
  if (missing.length) await sb.from("money_routine_runs").upsert(missing, { onConflict: "period,step_id", ignoreDuplicates: true });
  const { data: runs } = await sb.from("money_routine_runs").select("id,period,step_id,status,done_by,done_at,evidence,skip_reason").eq("period", period);
  const byStep = new Map(((runs ?? []) as RoutineRun[]).map((r) => [r.step_id, r]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
  const items: RoutineItem[] = live.map((s) => { const run = byStep.get(s.id) ?? null; const due = dueDate(period, s.anchor_day); return { ...s, run, due, overdue: (run?.status ?? "open") === "open" && due < today }; });
  const done = items.filter((i) => i.run && i.run.status !== "open").length;
  return { period, label: periodLabel(period), items, done, total: items.length };
}
