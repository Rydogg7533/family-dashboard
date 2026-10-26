import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str, num } from "@/lib/tools/types";
import { VEHICLE_SECTIONS, liveService, type ServiceEntry, type Warranty } from "@/lib/vehicle-fields";
import { collectWarranties, stateOf, syncWarrantyTasks } from "@/lib/warranties";

// The registers a household asks about by name: vehicles, warranties, things, the home. Reads answer
// "when does the Tahoe registration expire", "is the battery under warranty", "where's the drill", "what size
// is the furnace filter". The writes are the two that come up from a conversation -- a service line and a
// warranty end date -- and each one writes exactly what the page would, through the same columns.
//
// Pointers to 1Password items (policy, loan, VIN) are names, not secrets, and are returned as names. The
// app never holds the secret, so Ask cannot leak it.

type Ctx = Parameters<Tool["run"]>[1];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);
const matches = (ws: string[], hay: string) => { const h = norm(hay); return ws.every((w) => h.includes(w)); };

// Field labels, so the model and the person get "Registration expires", not "regExpiry".
const LABELS = new Map<string, string>();
for (const s of VEHICLE_SECTIONS) for (const f of s.fields) LABELS.set(f.key, f.label);
const labelOf = (k: string) => LABELS.get(k) ?? k;

type VehicleRow = { id: string; name: string; short: string; year: number | null; make: string; model: string; plate: string | null; driver: string | null; mileage: number | null; mileage_at: string | null; details: Record<string, unknown> | null; expiries: { label: string; date: string }[] | null };

async function vehicles(c: Ctx, text: string): Promise<VehicleRow[]> {
  const { data } = await c.sb.from("vehicles").select("id, name, short, year, make, model, plate, driver, mileage, mileage_at, details, expiries").order("created_at");
  const rows = (data ?? []) as VehicleRow[];
  const ws = words(text);
  return ws.length ? rows.filter((v) => matches(ws, `${v.name} ${v.short} ${v.year ?? ""} ${v.make} ${v.model}`) || ws.some((w) => norm(v.short).includes(w) || norm(v.model).includes(w))) : rows;
}

export const registerTools: Tool[] = [
  {
    name: "vehicle.find", title: "Find vehicles", kind: "read", tier: 1,
    description: "The household's vehicles, with driver, mileage and the next dates due (registration, insurance, inspection, warranties). Narrow by a name like 'Tahoe' or 'Sienna'.",
    input: { text: { type: "string", describe: "Which vehicle, by its name, make or model; unset for all", required: false } },
    async run(a, c) {
      const rows = await vehicles(c, str(a.text));
      if (!rows.length) return { ok: true, summary: str(a.text) ? `No vehicle called "${str(a.text)}".` : "No vehicles on record.", data: [] };
      const { data: ps } = await c.sb.from("profiles").select("id, display_name");
      const name = (id: string | null) => (ps ?? []).find((p) => p.id === id)?.display_name ?? "nobody yet";
      const data = rows.map((v) => {
        const next = (v.expiries ?? []).filter((e) => e.date && e.date >= c.today).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 4);
        return { id: v.id, name: `${v.year ?? ""} ${v.make} ${v.model} (${v.short})`.trim(), driver: name(v.driver), mileage: v.mileage, mileageAt: v.mileage_at, plate: v.plate, next: next.map((e) => `${e.label}: ${e.date}`), href: `/vehicles` };
      });
      return { ok: true, summary: `${rows.length} vehicle${rows.length === 1 ? "" : "s"}: ${data.map((d) => d.name).join("; ")}.`, data, href: "/vehicles" };
    },
  },
  {
    name: "vehicle.get", title: "Vehicle details", kind: "read", tier: 1,
    description: "Everything recorded about one vehicle: renewal dates, insurance and roadside (as names and phone numbers), parts and sizes (oil, filters, battery, tires), warranties, service history. Say which vehicle. Use for 'when does the Tahoe registration expire', 'what oil does the Sienna take', 'last oil change'.",
    input: { vehicle: { type: "string", describe: "Which vehicle: 'Tahoe', 'Sienna', or make/model", required: true }, topic: { type: "string", describe: "Optional words to pick the part that matters: 'registration', 'oil', 'tires', 'service', 'warranty', 'insurance'", required: false } },
    async run(a, c) {
      const rows = await vehicles(c, str(a.vehicle));
      if (!rows.length) return { ok: false, error: `No vehicle called "${str(a.vehicle)}". Ask vehicle.find for the list.` };
      if (rows.length > 1) return { ok: false, error: `More than one matches: ${rows.map((v) => v.short).join(", ")}. Say which.` };
      const v = rows[0]; const d = v.details ?? {};
      const ws = words(str(a.topic));
      const fields = Object.entries(d).filter(([k, val]) => typeof val === "string" && val && k !== "warranties" && k !== "serviceLog").map(([k, val]) => ({ field: labelOf(k), value: String(val) })).filter((f) => !ws.length || matches(ws, f.field) || ws.some((w) => norm(f.field).includes(w)));
      const warranties = ((d.warranties as Warranty[] | undefined) ?? []).map((w) => ({ item: w.item, provider: w.provider, start: w.start || null, end: w.end || null, state: !w.end ? "no end date" : w.end < c.today ? "expired" : "active", terms: w.terms || null }));
      const service = liveService(d.serviceLog as ServiceEntry[] | undefined).sort((x, y) => (y.date || "").localeCompare(x.date || "")).slice(0, 12).map((s) => ({ date: s.date || null, what: s.what, shop: s.shop || null, miles: s.miles || null, cost: s.cost || null }));
      const topicIs = (t: string) => ws.some((w) => t.includes(w));
      const showWarr = !ws.length || topicIs("warranty") || topicIs("battery") || topicIs("cover");
      const showSvc = !ws.length || topicIs("service") || topicIs("oil") || topicIs("maint") || topicIs("repair") || topicIs("last");
      return {
        ok: true,
        summary: `${v.year ?? ""} ${v.make} ${v.model} (${v.short}), ${v.mileage ? `${v.mileage.toLocaleString()} miles as of ${v.mileage_at ?? "unknown"}` : "mileage not recorded"}. ${fields.length} detail${fields.length === 1 ? "" : "s"}${showWarr ? `, ${warranties.length} warrant${warranties.length === 1 ? "y" : "ies"}` : ""}${showSvc ? `, ${service.length} service line${service.length === 1 ? "" : "s"}` : ""} below. Answer from these; say "not recorded" when a field is missing rather than guessing.`,
        data: { id: v.id, name: `${v.year ?? ""} ${v.make} ${v.model}`.trim(), short: v.short, plate: v.plate, fields, warranties: showWarr ? warranties : undefined, service: showSvc ? service : undefined, href: `/vehicles/${v.id}/edit` },
        href: `/vehicles/${v.id}/edit`,
      };
    },
  },
  {
    name: "vehicle.addService", title: "Add a service line", kind: "write", tier: 2, ownerOnly: true,
    description: "Record a service or repair on a vehicle's history: what was done, when, where, miles, cost. Only what the person said; nothing is invented.",
    input: {
      vehicle: { type: "string", describe: "Which vehicle", required: true },
      what: { type: "string", describe: "What was done, e.g. 'oil change', 'new battery'", required: true },
      date: { type: "date", describe: "When; default today", required: false },
      shop: { type: "string", describe: "Where, if said", required: false },
      miles: { type: "number", describe: "Odometer, if said", required: false },
      cost: { type: "number", describe: "Cost in dollars, if said", required: false },
    },
    async run(a, c) {
      const rows = await vehicles(c, str(a.vehicle));
      if (rows.length !== 1) return { ok: false, error: rows.length ? `More than one matches: ${rows.map((v) => v.short).join(", ")}.` : `No vehicle called "${str(a.vehicle)}".` };
      const v = rows[0]; const d = { ...(v.details ?? {}) } as Record<string, unknown>;
      const line: ServiceEntry = { date: str(a.date) || c.today, miles: Number.isFinite(num(a.miles)) && a.miles !== undefined ? String(num(a.miles)) : "", what: str(a.what).slice(0, 160), shop: str(a.shop).slice(0, 80), cost: Number.isFinite(num(a.cost)) && a.cost !== undefined ? num(a.cost).toFixed(2) : "", proof: "" };
      d.serviceLog = [...((d.serviceLog as ServiceEntry[] | undefined) ?? []), line];
      const patch: Record<string, unknown> = { details: d, updated_at: new Date().toISOString() };
      if (line.miles && (!v.mileage || Number(line.miles) > v.mileage)) { patch.mileage = Number(line.miles); patch.mileage_at = line.date; patch.mileage_estimated = false; }
      const { data, error } = await c.sb.from("vehicles").update(patch).eq("id", v.id).select("id").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Only an owner can change a vehicle." };
      await c.sb.from("activity_log").insert({ actor: c.email, action: "vehicle_service_added", subject: `${v.short}: ${line.what} ${line.date}`, ref: v.id, undoable: false }).then(() => {}, () => {});
      return { ok: true, summary: `Added to the ${v.short}'s history: ${line.what} on ${line.date}${line.shop ? ` at ${line.shop}` : ""}${line.miles ? `, ${Number(line.miles).toLocaleString()} miles` : ""}${line.cost ? `, $${line.cost}` : ""}.`, href: `/vehicles/${v.id}/edit` };
    },
  },
  {
    name: "warranty.find", title: "Find warranties", kind: "read", tier: 1,
    description: "Every warranty and protection plan across vehicles, devices and other things, with who it is for, the provider, when it ends and its state (active, ending soon, expired, no end date). Narrow by words. Use for 'is the battery under warranty', 'what's expiring'.",
    input: { text: { type: "string", describe: "Words from the item or provider", required: false }, state: { type: "enum", options: ["active", "soon", "expired", "needs_end"], describe: "Only this state", required: false } },
    async run(a, c) {
      const all = await collectWarranties(c.sb);
      const ws = words(str(a.text)), st = str(a.state);
      const rows = all.map((w) => ({ ...w, state: stateOf(w, c.today) })).filter((w) => (!ws.length || matches(ws, `${w.item} ${w.provider ?? ""} ${w.who}`)) && (!st || w.state === st)).sort((x, y) => (x.end ?? "9999").localeCompare(y.end ?? "9999"));
      const data = rows.map((w) => ({ id: w.key, name: w.item, who: w.who, provider: w.provider, date: w.end, start: w.start, state: w.state === "needs_end" ? "no end date recorded" : w.state === "soon" ? "ends within 45 days" : w.state, terms: w.terms, href: w.href }));
      return { ok: true, summary: rows.length ? `${rows.length} warrant${rows.length === 1 ? "y" : "ies"}${ws.length ? ` matching "${str(a.text)}"` : ""}. The person sees them as rows.` : `No warranty${ws.length ? ` matching "${str(a.text)}"` : ""} on record.`, data, href: "/warranties" };
    },
  },
  {
    name: "warranty.setEnd", title: "Set a warranty end date", kind: "write", tier: 1,
    description: "Record when a warranty ends. Find it with warranty.find first and pass its id. Works for warranties added on the Warranties page and for vehicle warranties.",
    input: { id: { type: "string", describe: "The warranty's id from warranty.find", required: true }, end: { type: "date", describe: "The end date", required: true } },
    async run(a, c) {
      const id = str(a.id), end = str(a.end);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: false, error: "Need a date." };
      if (id.startsWith("own:")) {
        const { data, error } = await c.sb.from("warranties").update({ end_date: end, updated_at: new Date().toISOString() }).eq("id", id.slice(4)).select("item").maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "No such warranty." };
        await syncWarrantyTasks(c.sb, c.userId).catch(() => null);
        return { ok: true, summary: `${data.item} warranty ends ${end}.`, href: "/warranties" };
      }
      const m = id.match(/^veh:([0-9a-f-]{36}):(\d+)$/i);
      if (m) {
        const { data: v } = await c.sb.from("vehicles").select("id, short, details").eq("id", m[1]).maybeSingle();
        const list = ((v?.details as { warranties?: Warranty[] } | null)?.warranties ?? []);
        const w = list[Number(m[2])];
        if (!v || !w) return { ok: false, error: "No such vehicle warranty." };
        list[Number(m[2])] = { ...w, end };
        const { data, error } = await c.sb.from("vehicles").update({ details: { ...(v.details as Record<string, unknown>), warranties: list }, updated_at: new Date().toISOString() }).eq("id", v.id).select("id").maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "Only an owner can change a vehicle." };
        await syncWarrantyTasks(c.sb, c.userId).catch(() => null);
        return { ok: true, summary: `${w.item || "Warranty"} on the ${v.short} ends ${end}.`, href: `/vehicles/${v.id}/edit` };
      }
      return { ok: false, error: "A device warranty is set on the Devices page." };
    },
  },
  {
    name: "thing.find", title: "Find things", kind: "read", tier: 1,
    description: "Things the household owns (the catalog): name, category, whose, where it is kept, status. Use for 'where's the drill', 'do we have a ladder', 'what's in the garage'.",
    input: { text: { type: "string", describe: "Words from the name, category or location", required: false }, limit: { type: "number", describe: "How many; 1 for 'the' one thing", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("items").select("id, name, category, owner_kind, owner_id, location, size, status").is("deleted_at", null).order("created_at", { ascending: false }).limit(1000);
      const ws = words(str(a.text));
      const rows = ((data ?? []) as { id: string; name: string; category: string | null; owner_kind: string; owner_id: string | null; location: string | null; size: string | null; status: string }[]).filter((r) => !ws.length || matches(ws, `${r.name} ${r.category ?? ""} ${r.location ?? ""}`));
      const want = Number.isFinite(num(a.limit)) && num(a.limit) > 0 ? Math.min(num(a.limit), 30) : 30;
      const shown = rows.slice(0, want).map((r) => ({ id: r.id, name: r.name, category: r.category, where: r.location, size: r.size, status: r.status, href: `/things/${r.id}` }));
      return { ok: true, summary: rows.length ? `${rows.length} thing${rows.length === 1 ? "" : "s"}${ws.length ? ` matching "${str(a.text)}"` : ""}${rows.length > want ? `; showing ${want}` : ""}. The person sees them as rows.` : `Nothing in the catalog${ws.length ? ` matching "${str(a.text)}"` : ""}.`, data: shown, href: shown.length === 1 ? shown[0].href : "/things" };
    },
  },
  {
    name: "home.find", title: "Home register", kind: "read", tier: 1,
    description: "The home's systems and parts: furnace, water heater, filters, appliances, with install and last-service dates, next due, and the company that services it. Use for 'what size is the furnace filter', 'when was the water heater installed', 'who services the AC'.",
    input: { text: { type: "string", describe: "Words from the item or system", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("home_items").select("id, name, system, installed, last_service, next_due, company").order("system");
      const ws = words(str(a.text));
      const rows = ((data ?? []) as { id: string; name: string; system: string; installed: string | null; last_service: string | null; next_due: string | null; company: string | null }[]).filter((r) => !ws.length || matches(ws, `${r.name} ${r.system}`));
      const shown = rows.map((r) => ({ id: r.id, name: r.name, system: r.system, installed: r.installed, lastService: r.last_service, date: r.next_due, company: r.company, href: "/home-property" }));
      return { ok: true, summary: rows.length ? `${rows.length} home item${rows.length === 1 ? "" : "s"}${ws.length ? ` matching "${str(a.text)}"` : ""}. Answer from these; say "not recorded" for anything missing.` : `Nothing in the home register${ws.length ? ` matching "${str(a.text)}"` : ""}.`, data: shown, href: "/home-property" };
    },
  },
];
