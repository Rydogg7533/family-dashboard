// What a person did with a model result, recorded append-only in ai_outcomes (migration 0043).
// Together with the ai_usage columns (latency, validity, prompt version) this is the reliability record that
// decides which model, local or cloud, may take which job. Field names only, never values. Bookkeeping must
// never break the action the person tapped, so every failure here is swallowed.
import type { createClient } from "@/lib/supabase/server";

type Sb = Awaited<ReturnType<typeof createClient>>;
export type Outcome = "accepted" | "edited" | "rejected" | "ignored";

export async function recordOutcome(sb: Sb, a: { kind: string; id: string; feature: string; outcome: Outcome; fieldsChanged?: string[]; note?: string }) {
  try {
    const { data: use } = await sb.from("ai_usage").select("id").eq("subject_kind", a.kind).eq("subject_id", a.id).eq("feature", a.feature).eq("sample", false).order("at", { ascending: false }).limit(1).maybeSingle();
    if (!use) return;
    const { data: last } = await sb.from("ai_outcomes").select("outcome").eq("usage_id", use.id).order("at", { ascending: false }).limit(1).maybeSingle();
    if (last?.outcome === a.outcome) return; // a repeated tap does not count twice
    await sb.from("ai_outcomes").insert({ usage_id: use.id, outcome: a.outcome, fields_changed: a.fieldsChanged ?? [], note: a.note ?? null });
  } catch {
    // never let bookkeeping break the action
  }
}

// The Yes tap on a read document: accepted as proposed, or edited when the person moved it to another folder first.
export async function recordFilingOutcome(sb: Sb, inboxId: string) {
  try {
    const { data: moved } = await sb.from("activity_log").select("id").eq("action", "filing_folder_changed").eq("ref", inboxId).limit(1);
    const edited = Boolean(moved?.length);
    await recordOutcome(sb, { kind: "inbox_item", id: inboxId, feature: "capture-read", outcome: edited ? "edited" : "accepted", fieldsChanged: edited ? ["folder"] : [] });
  } catch {
    // never let bookkeeping break the action
  }
}
