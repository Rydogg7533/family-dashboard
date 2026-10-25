"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getTillerHealth } from "@/lib/data-tiller-health";
import { NEEDS_COMPLETE_CHARGES } from "@/lib/money-routine-evidence";

type Res = { ok: boolean; error?: string };
const UUID = /^[0-9a-f-]{36}$/i;

async function who() {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { sb, actor: user.email ?? "member", name: (prof?.display_name as string | null) ?? user.email ?? "member" };
}
const touch = () => { revalidatePath("/money/routine"); revalidatePath("/money"); };

// Any member marks a step done, skipped (with a reason), or reopens it. Nothing is deleted; the row keeps who and when.
export async function setRoutineRun(runId: string, status: "done" | "skipped" | "open", reason?: string): Promise<Res> {
  if (!UUID.test(runId)) return { ok: false, error: "Unknown step." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const why = (reason ?? "").trim().slice(0, 200);
  if (status === "skipped" && !why) return { ok: false, error: "Say why it is skipped this month." };
  // The Tiller gate: neither Done nor Skip can close the Tiller check, or the steps that rely on complete charges, while an account is failing.
  if (status !== "open") {
    const { data: r0 } = await w.sb.from("money_routine_runs").select("period, step_id").eq("id", runId).maybeSingle();
    const { data: s0 } = r0 ? await w.sb.from("money_routine_steps").select("key").eq("id", r0.step_id).maybeSingle() : { data: null };
    const key = (s0?.key as string | undefined) ?? "";
    if (r0 && (key === "tiller:fill" || NEEDS_COMPLETE_CHARGES.includes(key))) {
      const h = await getTillerHealth(w.sb, r0.period as string);
      if (!h.ok) {
        const n = h.failing.length;
        return { ok: false, error: key === "tiller:fill"
          ? `Tiller is not healthy yet: ${n ? `${n} account${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention` : (h.syncLine ?? "no accounts to check")}. Fix it in Tiller, or confirm no activity on the account, then this ticks itself.`
          : "Waiting on the Tiller check: some account may be missing charges, so this cannot be closed yet." };
      }
    }
  }
  const now = new Date().toISOString();
  const patch = status === "open" ? { status, done_by: null, done_at: null, evidence: null, skip_reason: null, updated_at: now } : { status, done_by: w.name, done_at: now, evidence: status === "done" ? `${w.name} marked it done` : null, skip_reason: status === "skipped" ? why : null, updated_at: now };
  const { data, error } = await w.sb.from("money_routine_runs").update(patch).eq("id", runId).select("step_id, period").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That step is not in this month's list." };
  const { data: step } = await w.sb.from("money_routine_steps").select("key").eq("id", data.step_id).maybeSingle();
  await w.sb.from("activity_log").insert({ actor: w.actor, action: `routine_${status}`, subject: `${step?.key ?? data.step_id} ${data.period}${why ? `: ${why}` : ""}`.slice(0, 80), undoable: status !== "open" }).then(() => {}, () => {});
  touch();
  return { ok: true };
}

// "Yes, every month" turns a candidate into a routine step (source observed, owner either, due on the typical day); "No" declines it for good.
export async function answerCandidate(key: string, yes: boolean): Promise<Res> {
  if (!/^[a-z]+:[a-z_]+$/.test(key)) return { ok: false, error: "Unknown candidate." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { data: c } = await w.sb.from("money_routine_candidates").select("key,label,typical_day,status").eq("key", key).maybeSingle();
  if (!c || c.status !== "proposed") return { ok: false, error: "That one has already been answered." };
  const now = new Date().toISOString();
  let stepId: string | null = null;
  if (yes) {
    const { data: s, error } = await w.sb.from("money_routine_steps").upsert({ key: `learned:${key}`, label: c.label, detail: "Added because the household did this two months running.", cadence: "monthly", anchor_day: c.typical_day ?? 15, owner: "either", source: "observed", sort: 200, created_by: w.name }, { onConflict: "key" }).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    stepId = (s?.id as string) ?? null;
  }
  const { error } = await w.sb.from("money_routine_candidates").update({ status: yes ? "accepted" : "declined", step_id: stepId, answered_by: w.name, answered_at: now, updated_at: now }).eq("key", key);
  if (error) return { ok: false, error: error.message };
  await w.sb.from("activity_log").insert({ actor: w.actor, action: yes ? "routine_step_learned" : "routine_candidate_declined", subject: `${key}: ${c.label}`.slice(0, 80), undoable: false }).then(() => {}, () => {});
  touch();
  return { ok: true };
}

// "This account had no activity this month": a person's word that a quiet account is really quiet, not disconnected. Only offered for an account the check
// is failing; logged with who and when; nothing is deleted (undo sets revoked_at).
export async function confirmNoActivity(accountId: string, period: string): Promise<Res> {
  if (!/^\d{4}-\d{2}$/.test(period) || !accountId || accountId.length > 120) return { ok: false, error: "Unknown account or month." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const h = await getTillerHealth(w.sb, period);
  const a = h.accounts.find((x) => x.id === accountId);
  if (!a) return { ok: false, error: "That account is not in the list." };
  if (a.state !== "gap") return { ok: false, error: "That account already looks fine." };
  const now = new Date().toISOString();
  const { error } = await w.sb.from("account_period_confirms").upsert({ period, account_id: accountId, confirmed_by: w.name, confirmed_at: now, revoked_at: null, revoked_by: null }, { onConflict: "period,account_id" });
  if (error) return { ok: false, error: error.message };
  await w.sb.from("activity_log").insert({ actor: w.actor, action: "tiller_no_activity_confirmed", subject: `${a.label} ${period}`.slice(0, 80), undoable: false }).then(() => {}, () => {});
  touch();
  return { ok: true };
}
export async function undoNoActivity(accountId: string, period: string): Promise<Res> {
  if (!/^\d{4}-\d{2}$/.test(period) || !accountId) return { ok: false, error: "Unknown account or month." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const now = new Date().toISOString();
  const { error } = await w.sb.from("account_period_confirms").update({ revoked_at: now, revoked_by: w.name }).eq("period", period).eq("account_id", accountId).is("revoked_at", null);
  if (error) return { ok: false, error: error.message };
  await w.sb.from("activity_log").insert({ actor: w.actor, action: "tiller_no_activity_undone", subject: `${accountId} ${period}`.slice(0, 80), undoable: false }).then(() => {}, () => {});
  touch();
  return { ok: true };
}
