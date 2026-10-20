import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Vehicle, Person } from "@/lib/a-shared";
import type { VehicleInput } from "@/app/vehicles/actions";
import { EXPIRY_KEYS, type ServiceEntry, type Warranty } from "@/lib/vehicle-fields";

export const blankInput = (): VehicleInput => ({ year: "", make: "", model: "", short: "", plate: "", vinPointer: "", driver: "", mileage: "", mileageAt: "", details: {}, warranties: [], service: [] });

export function vehicleToInput(v: Vehicle): VehicleInput {
  const d = (v.details ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  for (const [k, val] of Object.entries(d)) if (typeof val === "string" || typeof val === "number") details[k] = String(val);
  // Renewal dates live in expiries; show them in the form.
  for (const e of EXPIRY_KEYS) { const hit = v.expiries.find((x) => x.label === e.label); if (hit && !details[e.key]) details[e.key] = hit.date; }
  return {
    year: v.year ? String(v.year) : "", make: v.make, model: v.model, short: v.short, plate: v.plate === "not recorded" ? "" : v.plate, vinPointer: v.vinPointer ?? "",
    driver: v.driverId ?? "", mileage: v.mileageKnown ? String(v.mileage) : "", mileageAt: v.mileageAt, details,
    warranties: (d.warranties as Warranty[]) ?? [], service: (d.serviceLog as ServiceEntry[]) ?? [],
  };
}

// The form's driver list uses profile ids; match the people shown on the page by name.
export async function formPeople(people: Person[]): Promise<{ id: string; name: string }[]> {
  if (!hasSupabaseEnv()) return people.filter((p) => p.role === "parent").map((p) => ({ id: p.id, name: p.name }));
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, display_name");
  return (data ?? []).map((p) => ({ id: p.id as string, name: String(p.display_name) }));
}
