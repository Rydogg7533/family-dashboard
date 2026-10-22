"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type Cycle = "weekly" | "monthly" | "yearly";
const step = (d: Date, c: Cycle) => { const n = new Date(d); if (c === "weekly") n.setDate(n.getDate() + 7); else if (c === "monthly") n.setMonth(n.getMonth() + 1); else n.setFullYear(n.getFullYear() + 1); return n; };

// One answer per possible subscription. "yes" adds it to the register (recurring_items) and closes the "Subscription?" task;
// "no" records that it is not one, so the mail agent never asks again. Nothing is deleted. The dashboard never charges or cancels anything.
export async function answerSubscription(candidateId: string, answer: "yes" | "no", amount?: number, cycle?: Cycle) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = prof?.display_name ?? user.email ?? "member";
  const { data: c } = await sb.from("subscription_candidates").select("*").eq("id", candidateId).maybeSingle();
  if (!c) return { ok: false, error: "That item no longer exists." };
  if (c.status !== "asking") return { ok: true, already: true };

  let recurringId: string | null = null;
  if (answer === "yes") {
    if (!(typeof amount === "number" && Number.isFinite(amount) && amount > 0)) return { ok: false, error: "Enter the amount you are charged." };
    if (!cycle || !["weekly", "monthly", "yearly"].includes(cycle)) return { ok: false, error: "Pick how often it charges." };
    // next charge: the last receipt date plus one cycle, rolled forward until it is today or later
    let next = step(new Date((c.last_seen ?? new Date().toISOString().slice(0, 10)) + "T12:00:00"), cycle);
    for (let i = 0; i < 500 && next.getTime() < Date.now() - 86400000; i++) next = step(next, cycle);
    const row = { name: String(c.name).replace(/\s+(Inc\.?|LLC|PBC)$/i, "").replace(/,\s*$/, ""), kind: "subscription", amount, cycle, next_charge: next.toISOString().slice(0, 10), merchant_key: c.merchant_key, category: null as string | null, status: "active", first_seen: c.first_seen, last_seen: c.last_seen, last_amount: amount, created_by: who, decided_by: who, decision: "keep", on_register: true };
    const made = await sb.from("recurring_items").insert(row).select("id").single();
    if (made.error) {
      const ex = await sb.from("recurring_items").select("id").eq("merchant_key", c.merchant_key).maybeSingle();   // already on the register: link, don't duplicate
      if (!ex.data) return { ok: false, error: "Could not add it to the register." };
      recurringId = ex.data.id;
    } else recurringId = made.data.id;
  }

  const upd = await sb.from("subscription_candidates").update({ status: answer === "yes" ? "subscription" : "not_subscription", recurring_id: recurringId, answered_by: who, answered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", candidateId).eq("status", "asking");
  if (upd.error) return { ok: false, error: "Could not save the answer." };

  if (c.task_merge_key) await sb.from("tasks").update({ status: answer === "yes" ? "done" : "dismissed", updated_at: new Date().toISOString() }).eq("merge_key", c.task_merge_key).eq("status", "open").then(() => {}, () => {});
  await sb.from("activity_log").insert({ actor: who, action: answer === "yes" ? "subscription_added" : "subscription_not", subject: answer === "yes" ? `${c.name}: added to the register ($${amount}, ${cycle})` : `${c.name}: marked not a subscription`, ref: candidateId, undoable: false }).then(() => {}, () => {});
  return { ok: true };
}
