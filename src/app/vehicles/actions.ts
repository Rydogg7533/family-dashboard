"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { EXPIRY_KEYS, type ServiceEntry, type Warranty } from "@/lib/vehicle-fields";

export type VehicleInput = {
  year: string; make: string; model: string; short: string; plate: string; vinPointer: string; driver: string;
  mileage: string; mileageAt: string; details: Record<string, string>; warranties: Warranty[]; service: ServiceEntry[];
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// Saves a vehicle. Owners only (RLS agrees). Dates in the "Renewals" section become reminders; other expiries are left alone.
export async function saveVehicle(id: string | null, v: VehicleInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true, id: id ?? "sample" };
  const year = Number(v.year) || null, make = clean(v.make), model = clean(v.model);
  if (!make || !model) return { ok: false, error: "Make and model are required." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const details: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v.details)) if (clean(val)) details[k] = clean(val);
  const warranties = v.warranties.filter((w) => clean(w.item) || clean(w.provider) || w.end);
  const service = v.service.filter((s) => clean(s.what) || s.date);
  if (warranties.length) details.warranties = warranties;
  if (service.length) details.serviceLog = service;

  type Exp = { label: string };
  let existing: { expiries: Exp[] } | null = null;
  if (id) existing = (await sb.from("vehicles").select("expiries").eq("id", id).maybeSingle()).data as { expiries: Exp[] } | null;
  const ownLabels = new Set(EXPIRY_KEYS.map((e) => e.label));
  const kept = (existing?.expiries ?? []).filter((e) => !ownLabels.has(e.label));
  const fromForm = EXPIRY_KEYS.filter((e) => v.details[e.key]).map((e) => ({ label: e.label, date: v.details[e.key], kind: e.kind, action: e.action, source: e.source, href: "#" }));
  // Warranty end dates also become reminders so they surface before they lapse.
  const warrantyReminders = warranties.filter((w) => w.end).map((w) => ({ label: `${clean(w.item) || "Warranty"} warranty ends`, date: w.end, kind: "warranty", action: "Claim or renew", source: clean(w.provider) || "Warranty", href: "#" }));
  const expiries = [...kept.filter((e) => !String(e.label).endsWith("warranty ends")), ...fromForm, ...warrantyReminders];

  const name = [year, make, model].filter(Boolean).join(" ");
  const row = {
    name, short: clean(v.short) || model, year, make, model, plate: clean(v.plate) || null, vin_pointer: clean(v.vinPointer) || null,
    driver: v.driver || null, mileage: v.mileage ? Number(v.mileage) : null, mileage_at: v.mileage ? (v.mileageAt || new Date().toISOString().slice(0, 10)) : null,
    details, expiries, updated_by: user.email ?? "member", updated_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await sb.from("vehicles").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await sb.from("vehicles").insert({ ...row, added_by: user.email ?? "member" }).select("id").single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "vehicle_saved", subject: name, ref: id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/vehicles");
  return { ok: true, id: id! };
}
