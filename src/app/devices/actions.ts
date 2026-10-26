"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type DeviceInput = {
  name: string; kind: string; make: string; person: string; status: string; serialLast4: string; serialPointer: string;
  purchaseDate: string; warrantyEnd: string; planName: string; planEnd: string; subscription: string; note: string;
};

const STATUSES = ["in use", "spare", "loaned", "retired"];
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// Adds a device. Owners only (RLS agrees). Serials are last digits only; the full serial stays in the vault.
export async function saveDevice(d: DeviceInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true, id: "sample" };
  const name = clean(d.name), kind = clean(d.kind);
  if (!name) return { ok: false, error: "Give the device a name." };
  if (!kind) return { ok: false, error: "Pick what kind of device it is." };
  const last4 = clean(d.serialLast4);
  if (last4.length > 4) return { ok: false, error: "Serial: the last 4 characters only. The full serial stays in 1Password." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const row = {
    name, kind, make: clean(d.make) || null, person: d.person || null, status: STATUSES.includes(d.status) ? d.status : "in use",
    serial_last4: last4 || null, serial_pointer: clean(d.serialPointer) || null, purchase_date: d.purchaseDate || null, warranty_end: d.warrantyEnd || null,
    plan_name: clean(d.planName) || null, plan_end: d.planEnd || null, subscription: clean(d.subscription) || null, note: clean(d.note) || null,
    added_by: user.email ?? "member", updated_by: user.email ?? "member",
  };
  const { data, error } = await sb.from("devices").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "device_added", subject: name, ref: data.id as string, undoable: false }).then(() => {}, () => {});
  revalidatePath("/devices");
  return { ok: true, id: data.id as string };
}
