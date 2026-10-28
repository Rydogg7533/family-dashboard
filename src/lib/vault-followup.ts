import type { createClient } from "@/lib/supabase/server";
import { defaultAssignment } from "@/lib/task-defaults";

type Sb = Awaited<ReturnType<typeof createClient>>;

// D17 (Ryan, 2026-10-28): whenever the system sees something new that has a part the dashboard does not store (a device's
// full serial and receipt, a new insurance period, a new registration), it makes one task to update 1Password, so the
// vault never goes stale. Every feature that notices a new or changed thing calls this one function; nobody writes their own.
//
// kind + ref name the thing (device:<id>, vehicle:<id>); version names the change (the new renewal date, "new"). The pair is the
// task's merge key: saving the same value again never makes a second task, a new insurance period always makes one, and a task
// a person dismissed or finished is not recreated for the same change.
export type VaultFollowUp = {
  kind: "device" | "vehicle" | "insurance" | "registration" | "account" | "warranty" | "other";
  ref: string;
  version: string;
  title: string;                // "Update 1Password: Melissa's iPad"
  summary: string;              // what to put where, in words
  person?: string | null;       // whose task, when it is one person's; otherwise the household default
  vehicleId?: string | null;    // a vehicle's driver gets it
  dueInDays?: number;
};

export async function vaultFollowUp(sb: Sb, creatorId: string, f: VaultFollowUp): Promise<{ made: boolean }> {
  try {
    const mk = `vault:${f.kind}:${f.ref}:${f.version}`.slice(0, 200);
    const { data: have } = await sb.from("tasks").select("id").eq("merge_key", mk).limit(1);
    if (have?.length) return { made: false };
    let who = await defaultAssignment(sb, creatorId, f.vehicleId ?? null);
    if (f.person) {
      const { data: people } = await sb.from("profiles").select("id");
      who = { person: f.person, audience: "one", fyi: (people ?? []).map((p) => p.id as string).filter((id) => id !== f.person) };
    }
    const due = new Date(Date.now() + (f.dueInDays ?? 7) * 86400_000).toISOString();
    const { error } = await sb.from("tasks").insert({ person: who.person, audience: who.audience, fyi: who.fyi, kind: "do", title: f.title.slice(0, 160), summary: f.summary.slice(0, 600), origin_kind: "vault", origin_ref: mk, merge_key: mk, due_at: due, tier: 1 });
    return { made: !error };
  } catch { return { made: false }; }   // bookkeeping: never break the save that triggered it
}
