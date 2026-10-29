"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type Cycle = "weekly" | "monthly" | "yearly";
const step = (d: Date, c: Cycle) => { const n = new Date(d); if (c === "weekly") n.setDate(n.getDate() + 7); else if (c === "monthly") n.setMonth(n.getMonth() + 1); else n.setFullYear(n.getFullYear() + 1); return n; };

// One answer per possible subscription. "yes" adds it to the register (recurring_items) and closes the "Subscription?" task;
// "no" records that it is not one, so the mail agent never asks again. Nothing is deleted. The dashboard never charges or cancels anything.
export async function answerSubscription(candidateId: string, answer: "yes" | "no" | "ended", amount?: number, cycle?: Cycle) {
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

  // Ended (issue 984d6052): it WAS a subscription and is not any more. The charges happened, so it goes on the register as
  // cancelled with its last day, never as "not one"; and the sender's mail stops being triaged -- proposed, never activated
  // here, the same way Review proposes a rule (D121).
  let proposedRule: string | null = null;
  if (answer === "ended") {
    const ended = c.last_seen ?? new Date().toISOString().slice(0, 10);
    const row = { name: String(c.name).replace(/\s+(Inc\.?|LLC|PBC)$/i, "").replace(/,\s*$/, ""), kind: "subscription", amount: typeof amount === "number" && amount > 0 ? amount : c.amount_hint ?? 0, cycle: cycle ?? c.cycle_hint ?? "monthly", next_charge: ended, merchant_key: c.merchant_key, category: null as string | null, status: "cancelled", ended_at: ended, first_seen: c.first_seen, last_seen: c.last_seen, on_register: false, created_by: who };
    const made = await sb.from("recurring_items").insert(row).select("id").single();
    if (made.error) {
      const ex = await sb.from("recurring_items").select("id").eq("merchant_key", c.merchant_key).maybeSingle();
      if (ex.data) { recurringId = ex.data.id; await sb.from("recurring_items").update({ status: "cancelled", ended_at: ended }).eq("id", ex.data.id).then(() => {}, () => {}); }
      else return { ok: false, error: "Could not record it as ended." };
    } else recurringId = made.data.id;
    const from = String(c.address ?? "").trim().toLowerCase();
    if (from) {
      const { error: e2 } = await sb.from("email_rules").insert({ match_kind: "sender", match_value: from, action: "ignore", mailbox: null, status: "proposed", proposed_by: user.id, origin: `Subscription ended (${c.id.slice(0, 8)})`, note: `You said the ${c.name} subscription has ended.` });
      proposedRule = e2 ? null : from;                 // a duplicate proposal (unique index) is fine: it already exists
    }
  }

  const upd = await sb.from("subscription_candidates").update({ status: answer === "yes" ? "subscription" : answer === "ended" ? "ended" : "not_subscription", recurring_id: recurringId, answered_by: who, answered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", candidateId).eq("status", "asking");
  if (upd.error) return { ok: false, error: "Could not save the answer." };

  if (c.task_merge_key) await sb.from("tasks").update({ status: answer === "no" ? "dismissed" : "done", updated_at: new Date().toISOString() }).eq("merge_key", c.task_merge_key).eq("status", "open").then(() => {}, () => {});
  await sb.from("activity_log").insert({ actor: who, action: answer === "yes" ? "subscription_added" : answer === "ended" ? "subscription_ended" : "subscription_not", subject: answer === "yes" ? `${c.name}: added to the register ($${amount}, ${cycle})` : answer === "ended" ? `${c.name}: recorded as ended${proposedRule ? `; a rule for ${proposedRule} is proposed on Review` : ""}` : `${c.name}: marked not a subscription`, ref: candidateId, undoable: false }).then(() => {}, () => {});
  return { ok: true, proposedRule };
}
