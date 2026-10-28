"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Scope, Verdict } from "@/lib/data-review";

// Judging an email-made task. Writes one task_reviews row and NOTHING else: not the task's status
// (the queue stays as the person left it) and not activity_log. The log is for what the system did on
// its own (F12.10); this is a person marking up the system's work, and the row already carries who
// and when, so a log line beside it would be 50-odd rows of duplicate noise.
//
// Re-tappable: the task is the primary key, so a second answer replaces the first. A fresh verdict
// resets scope to 'once', since "wrong every time" said about one reading of the task should not
// survive the person changing their mind about what the task was.
export async function recordTriageVerdict(taskId: string, verdict: Verdict, scope: Scope = "once") {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { error } = await sb.from("task_reviews").upsert({
    task: taskId,
    verdict,
    scope: verdict === "right" ? "once" : scope,
    reviewed_by: user.id,
    reviewed_by_name: me?.display_name ?? user.email ?? "member",
    at: new Date().toISOString(),
  }, { onConflict: "task" });
  if (error) return { ok: false, error: "Could not save that." };

  // "Not a task, every time" is a sender rule in the making (D121). It is PROPOSED here, never activated:
  // the Activate tap on the rules section is what makes triage read it. Needs the sender on the task
  // (origins[].from, written by triage since D121); older tasks without it get the verdict only.
  let proposed: string | null = null;
  if (verdict === "not_a_task" && scope === "every_time") {
    const { data: t } = await sb.from("tasks").select("origins, title").eq("id", taskId).maybeSingle();
    const origins = (Array.isArray(t?.origins) ? t!.origins : []) as { from?: string; account?: string }[];
    const from = String(origins.find((o) => o.from)?.from ?? "").trim().toLowerCase();
    if (from) {
      const { error: e2 } = await sb.from("email_rules").insert({
        match_kind: "sender", match_value: from, action: "ignore", mailbox: null, status: "proposed",
        proposed_by: user.id, origin: `Review: not a task, every time (${taskId.slice(0, 8)})`,
        note: `You said "${String(t?.title ?? "").slice(0, 60)}" was not a task, every time.`,
      });
      proposed = e2 ? null : from;                        // a duplicate proposal (unique index) is fine: it already exists
    }
  }
  revalidatePath("/review");
  return { ok: true, proposed };
}

// Owners activate or decline a proposed sender rule. Activate is the tap that makes email-agent.mjs and
// icloud-triage.mjs apply it on their next run; declining keeps the row as 'off' (history, never deleted).
// Both are logged: a rule that will act on future mail is a medium-tier change (F15 fix 2).
export async function setEmailRule(id: string, status: "approved" | "off") {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await sb.from("profiles").select("display_name, role").eq("id", user.id).maybeSingle();
  if (me?.role !== "owner") return { ok: false, error: "Only an owner can switch a rule on." };
  const { data: rule } = await sb.from("email_rules").select("match_kind, match_value, action").eq("id", id).maybeSingle();
  const { error } = await sb.from("email_rules").update(status === "approved"
    ? { status, activated_by: user.id, activated_at: new Date().toISOString() }
    : { status }).eq("id", id);
  if (error) return { ok: false, error: "Could not save that." };
  const who = me?.display_name ?? user.email ?? "member";
  await sb.from("activity_log").insert({ actor: who, action: status === "approved" ? "email_rule_on" : "email_rule_off",
    subject: `${who} ${status === "approved" ? "switched on" : "declined"} the rule: ${rule?.action ?? "?"} mail from ${rule?.match_value ?? "?"}`, ref: id, undoable: false });
  revalidatePath("/review");
  return { ok: true };
}

// Confirming the week writes one log row and nothing else. The sections above it are settled by their own
// actions (setTaskStatus, the subscription answer); this is the record that someone looked, with the count
// of what they left open. It is not a lock: anything still open stays on the list.
export async function confirmWeek(open: number) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = me?.display_name ?? user.email ?? "member";
  const subject = open ? `${who} confirmed the week with ${open} item${open === 1 ? "" : "s"} still open` : `${who} confirmed the week`;
  const { error } = await sb.from("activity_log").insert({ actor: who, action: "week_confirmed", subject, undoable: false });
  if (error) return { ok: false, error: "Could not record it." };
  revalidatePath("/review"); revalidatePath("/");
  return { ok: true };
}

// D18 "Still deciding": a replaced or gone thing gets its fate here, with one tap. "Still not sure" only moves the
// next ask out 30 days. Household hand-downs need a name, so that one goes through Ask instead.
export async function decideFate(ref: string, fate: "spare" | "sell" | "give" | "trash" | "trade_in" | "lost" | "undecided") {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { applyFate } = await import("@/lib/owned");
  const r = await applyFate(sb, ref, fate, undefined, fate === "undecided" ? undefined : "from the weekly review", user.email ?? "member");
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/review");
  return { ok: true };
}
