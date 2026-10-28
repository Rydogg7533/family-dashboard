"use server";
import { vaultFollowUp } from "@/lib/vault-followup";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type DeviceInput = {
  name: string; kind: string; make: string; person: string; status: string; serialLast4: string; serialPointer: string;
  purchaseDate: string; warrantyEnd: string; planName: string; planEnd: string; subscription: string; note: string;
};

const STATUSES = ["in use", "spare", "loaned", "retired"];
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// Adds a device. Owners only (RLS agrees). Serials are last digits only; the full serial stays in the vault.
export async function saveDevice(d: DeviceInput, id?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
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
  if (id) {
    const { data: before } = await sb.from("devices").select("serial_last4, warranty_end, plan_name, plan_end").eq("id", id).maybeSingle();
    const { error } = await sb.from("devices").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    // D17: a new serial, warranty or plan has paperwork the vault holds; keep it current.
    const changed = before && (before.serial_last4 !== row.serial_last4 || before.warranty_end !== row.warranty_end || before.plan_name !== row.plan_name || before.plan_end !== row.plan_end);
    if (changed) await vaultFollowUp(sb, user.id, { kind: "device", ref: id, version: `${row.serial_last4 ?? ""}|${row.warranty_end ?? ""}|${row.plan_name ?? ""}|${row.plan_end ?? ""}`, title: `Update 1Password: ${name}`, summary: `${name} changed (serial, warranty or plan). Put the new full serial or IMEI, the receipt and the warranty or plan document in 1Password, then put the item's name in the device's serial pointer here.`, person: row.person });
    await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "device_saved", subject: name, ref: id, undoable: false }).then(() => {}, () => {});
    revalidatePath("/devices"); revalidatePath(`/devices/${id}`);
    return { ok: true, id };
  }
  const { data, error } = await sb.from("devices").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await vaultFollowUp(sb, user.id, { kind: "device", ref: data.id as string, version: "new", title: `Update 1Password: ${name}`, summary: `New device. Put the full serial or IMEI, the receipt${row.warranty_end || row.plan_name ? " and the warranty or plan document" : ""} in 1Password, then put the item's name in the device's serial pointer here. The dashboard keeps only the last four.`, person: row.person });
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "device_added", subject: name, ref: data.id as string, undoable: false }).then(() => {}, () => {});
  revalidatePath("/devices");
  return { ok: true, id: data.id as string };
}

// Retire, sell, lose or bring back. Never a delete: the row keeps its history and the register keeps the record.
export async function setDeviceStatus(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  if (!["in use", "spare", "loaned", "for sale", "retired", "lost"].includes(status)) return { ok: false, error: "Unknown status." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const { data, error } = await sb.from("devices").update({ status, updated_by: user.email ?? "member", updated_at: new Date().toISOString() }).eq("id", id).select("name").single();
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "device_status", subject: `${data?.name ?? "Device"}: ${status}`, ref: id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/devices"); revalidatePath(`/devices/${id}`);
  return { ok: true };
}
