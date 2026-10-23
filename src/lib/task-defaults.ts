import type { createClient } from "@/lib/supabase/server";

type Sb = Awaited<ReturnType<typeof createClient>>;
export type Assignment = { person: string; audience: "one" | "both"; fyi: string[] };

// Who a new task goes to by default. A vehicle task goes to that vehicle's driver (the other parent gets a heads-up);
// anything else about the household goes to both. The creator is only the owner of record for "both".
export async function defaultAssignment(sb: Sb, creatorId: string, vehicleId?: string | null): Promise<Assignment> {
  const { data: people } = await sb.from("profiles").select("id");
  const other = (people ?? []).map((p) => p.id as string).filter((id) => id !== creatorId);
  if (vehicleId) {
    const { data: v } = await sb.from("vehicles").select("driver").eq("id", vehicleId).maybeSingle();
    const driver = v?.driver as string | null | undefined;
    if (driver) return { person: driver, audience: "one", fyi: [creatorId, ...other].filter((id) => id !== driver) };
  }
  return { person: creatorId, audience: "both", fyi: [] };
}
