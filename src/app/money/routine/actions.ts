"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

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
