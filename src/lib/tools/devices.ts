import { vaultFollowUp } from "@/lib/vault-followup";
import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";

const STATUS = ["in use", "spare", "loaned", "for sale", "retired", "lost"];

export const deviceTools: Tool[] = [
  {
    name: "device.find", title: "Find devices", kind: "read", tier: 1,
    description: "List the household's devices and belongings. Everyone sees every device, whoever it belongs to.",
    input: { text: { type: "string", describe: "Words to look for in the name, make or kind", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("devices").select("id, name, kind, make, status, serial_last4, warranty_end, plan_name, plan_end, person").limit(300);
      const q = str(a.text).toLowerCase();
      const rows = (data ?? []) as Record<string, unknown>[];
      const hits = q ? rows.filter((d) => `${d.name} ${d.make} ${d.kind}`.toLowerCase().includes(q)) : rows;
      return { ok: true, summary: `${hits.length} device${hits.length === 1 ? "" : "s"}`, data: hits };
    },
  },
  {
    name: "device.add", title: "Add a device", kind: "write", tier: 2,
    description: "Put a device or belonging in the register. Serial numbers: the last 4 characters only, never the whole one.",
    input: {
      name: { type: "string", describe: "What it is called in lists, like Ryan's iPhone", required: true },
      kind: { type: "string", describe: "Phone, Laptop, Watch, TV, E-bike, Appliance…", required: true },
      make: { type: "string", describe: "Make and model", required: false },
      serialLast4: { type: "string", describe: "The last 4 characters of the serial or IMEI, nothing more", required: false },
      warrantyEnd: { type: "date", describe: "When the warranty ends", required: false },
      planName: { type: "string", describe: "Protection plan, like AppleCare+", required: false },
      planEnd: { type: "date", describe: "When that plan ends", required: false },
      note: { type: "string", describe: "Anything else said about it", required: false },
    },
    async run(a, c) {
      const last4 = str(a.serialLast4);
      if (last4.length > 4) return { ok: false, error: "Serial: the last 4 characters only. The whole one stays in the vault." };
      const row = {
        name: str(a.name).slice(0, 120), kind: str(a.kind).slice(0, 40), make: str(a.make) || null, person: c.userId, status: "in use",
        serial_last4: last4 || null, warranty_end: str(a.warrantyEnd) || null, plan_name: str(a.planName) || null,
        plan_end: str(a.planEnd) || null, note: str(a.note) || null, added_by: c.email, updated_by: c.email,
      };
      const { data, error } = await c.sb.from("devices").insert(row).select("id").single();
      if (error) return { ok: false, error: error.message };
      const fu = await vaultFollowUp(c.sb, c.userId, { kind: "device", ref: data.id as string, version: "new", title: `Update 1Password: ${row.name}`, summary: `New device. Put the full serial or IMEI, the receipt${row.warranty_end || row.plan_name ? " and the warranty or plan document" : ""} in 1Password, then put the item's name in the device's serial pointer. The dashboard keeps only the last four.`, person: row.person });
      return { ok: true, summary: `Added ${row.name} to the register${fu.made ? ", and a task is on your list to put the full serial and receipt in 1Password" : ""}`, href: `/devices/${data.id as string}` };
    },
  },
  {
    name: "device.setStatus", title: "Change a device's status", kind: "write", tier: 2,
    description: "Retire, sell, lose or bring back a device. Nothing is ever deleted; the record stays either way.",
    input: {
      id: { type: "string", describe: "The device's id, from device.find", required: true },
      status: { type: "enum", options: STATUS, describe: "What it is now", required: true },
    },
    async run(a, c) {
      const status = str(a.status);
      if (!STATUS.includes(status)) return { ok: false, error: `Status must be one of: ${STATUS.join(", ")}.` };
      const { data, error } = await c.sb.from("devices").update({ status, updated_by: c.email, updated_at: new Date().toISOString() }).eq("id", str(a.id)).select("name").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "No device with that id." };
      return { ok: true, summary: `${data.name}: ${status}`, href: `/devices/${str(a.id)}` };
    },
  },
];
