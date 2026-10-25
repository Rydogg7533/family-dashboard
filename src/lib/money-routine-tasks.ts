// One task per OPEN routine step for the period, in Tasks (F7: the close shows up where the person already looks).
// Merged by key and period, so re-reading never duplicates; closes itself when the step is done or skipped; a task a person
// dismissed is not recreated. Owner: the step's owner; "either" goes to Ryan with Melissa on FYI (Claude's inference).
import type { createClient } from "@/lib/supabase/server";
import type { RoutineItem } from "@/lib/data-money-routine";

type Sb = Awaited<ReturnType<typeof createClient>>;

export async function syncRoutineTasks(sb: Sb, period: string, items: RoutineItem[]) {
  const { data: people } = await sb.from("profiles").select("id, display_name");
  const byName = new Map((people ?? []).map((p) => [String(p.display_name ?? ""), p.id as string]));
  const ryan = byName.get("Ryan"), melissa = byName.get("Melissa");
  if (!ryan) return;
  const keys = items.map((i) => `routine:${i.key}@${period}`);
  const { data: have } = await sb.from("tasks").select("id, merge_key, status").in("merge_key", keys);
  const byKey = new Map((have ?? []).map((t) => [t.merge_key as string, t]));
  for (const i of items) {
    const mk = `routine:${i.key}@${period}`, t = byKey.get(mk), open = (i.run?.status ?? "open") === "open";
    if (open && !t) {
      const person = i.owner === "Melissa" ? melissa ?? ryan : ryan;
      const fyi = i.owner === "either" && melissa ? [melissa] : [];
      await sb.from("tasks").insert({ person, audience: "one", fyi, kind: "do", title: i.label, summary: [i.detail, i.evidence && !i.evidence.met ? `The app sees: ${i.evidence.line}.` : null].filter(Boolean).join(" ") || null, origin_kind: "routine", origin_ref: mk, merge_key: mk, due_at: `${i.due}T23:59:00-06:00`, tier: 1 }).then(() => {}, () => {});
    } else if (!open && t && t.status === "open") {
      await sb.from("tasks").update({ status: "done", done_by: i.run?.done_by ?? "System", updated_at: new Date().toISOString() }).eq("id", t.id).then(() => {}, () => {});
    }
  }
}
