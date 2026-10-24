import type { createClient } from "@/lib/supabase/server";
import { featureState, type ChildFeature } from "@/lib/child-access";
import type { ChildRow } from "@/lib/children";
import { defaultAssignment } from "@/lib/task-defaults";

type Sb = Awaited<ReturnType<typeof createClient>>;

// Harmless features switch on by themselves at their age. Sensitive ones (money, messages, location, health, documents) do not: when a child
// reaches the age for one that is built, a parent gets ONE task asking to turn it on. A task already made (open, done or dismissed) is never
// remade, so a "no" stays a no. Runs for parents on Today; creates nothing for features that are not built yet.
export async function syncChildUnlockTasks(sb: Sb, userId: string, kids: ChildRow[], features: ChildFeature[], ages: Record<string, number>) {
  const waiting = kids.filter((k) => k.profile_id && !k.paused_at).flatMap((k) => features.filter((f) => f.built && f.sensitive).filter((f) => featureState(f, k, ages).why === "needs_ok").map((f) => ({ k, f })));
  if (!waiting.length) return;
  const { data: all } = await sb.from("tasks").select("origin_ref").eq("origin_kind", "child_unlock");
  const have = new Set((all ?? []).map((t) => t.origin_ref as string));
  for (const { k, f } of waiting) {
    const ref = `${k.id}:${f.key}`;
    if (have.has(ref)) continue;
    const a = await defaultAssignment(sb, userId);
    await sb.from("tasks").insert({ person: a.person, audience: "both", fyi: [], kind: "decide", title: `${k.display_name} is old enough for “${f.label}”. Turn it on?`, summary: `${f.description} It stays off until you allow it: Settings, People and access, ${k.display_name}.`, origin_kind: "child_unlock", origin_ref: ref, due_at: new Date().toISOString(), tier: 2 }).then(() => {}, () => {});
  }
}
