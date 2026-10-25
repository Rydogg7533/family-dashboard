import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { evidenceFor, type Evidence } from "@/lib/money-routine-evidence";
import { syncRoutineTasks } from "@/lib/money-routine-tasks";

export type RoutineStep = { id: string; key: string; label: string; detail: string | null; cadence: string; anchor_day: number | null; account_id: string | null; owner: string; href: string | null; source: string; sort: number };
export type RoutineRun = { id: string; period: string; step_id: string; status: "open" | "done" | "skipped"; done_by: string | null; done_at: string | null; evidence: string | null; skip_reason: string | null };
export type RoutineItem = RoutineStep & { run: RoutineRun | null; due: string; overdue: boolean; evidence: Evidence | null };
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
  const { data: steps } = await sb.from("money_routine_steps").select("id,key,label,detail,cadence,anchor_day,account_id,owner,href,source,sort").is("retired_at", null).order("sort").order("key");
  const live = (steps ?? []) as RoutineStep[];
  if (!live.length) return { period, label: periodLabel(period), items: [], done: 0, total: 0 };
  const { data: have } = await sb.from("money_routine_runs").select("step_id").eq("period", period);
  const haveIds = new Set((have ?? []).map((r) => r.step_id as string));
  const missing = live.filter((s) => !haveIds.has(s.id)).map((s) => ({ period, step_id: s.id }));
  if (missing.length) await sb.from("money_routine_runs").upsert(missing, { onConflict: "period,step_id", ignoreDuplicates: true });
  const { data: runs0 } = await sb.from("money_routine_runs").select("id,period,step_id,status,done_by,done_at,evidence,skip_reason").eq("period", period);
  const byStep = new Map(((runs0 ?? []) as RoutineRun[]).map((r) => [r.step_id, r]));
  // Evidence: the app's own records. An open step whose rule is met ticks itself (evidence named, logged as the app's doing).
  // A step a person already closed is left alone; the evidence line is shown beside it instead.
  const accts = new Map<string, string | null>();
  { const { data: a } = await sb.from("accounts").select("id,last4"); for (const x of a ?? []) accts.set(x.id as string, (x.last4 as string | null) ?? null); }
  const evid = new Map<string, Evidence | null>();
  for (const s of live) {
    const e = await evidenceFor(sb, s.key, period, s.account_id ? accts.get(s.account_id) ?? null : null).catch(() => null);
    evid.set(s.id, e);
    const run = byStep.get(s.id);
    if (e?.met && run && run.status === "open") {
      const now = new Date().toISOString();
      const { data: upd } = await sb.from("money_routine_runs").update({ status: "done", done_by: "System", done_at: now, evidence: `app: ${e.line}`, updated_at: now }).eq("id", run.id).eq("status", "open").select("id").maybeSingle();
      if (upd) { byStep.set(s.id, { ...run, status: "done", done_by: "System", done_at: now, evidence: `app: ${e.line}` }); await sb.from("activity_log").insert({ actor: "System (routine)", action: "routine_done", subject: `${s.key} ${period}: ${e.line}`.slice(0, 80), undoable: true }).then(() => {}, () => {}); }
    }
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
  const items: RoutineItem[] = live.map((s) => { const run = byStep.get(s.id) ?? null; const due = dueDate(period, s.anchor_day); return { ...s, run, due, overdue: (run?.status ?? "open") === "open" && due < today, evidence: evid.get(s.id) ?? null }; });
  await syncRoutineTasks(sb, period, items).catch(() => {});
  const done = items.filter((i) => i.run && i.run.status !== "open").length;
  return { period, label: periodLabel(period), items, done, total: items.length };
}
