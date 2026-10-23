import type { createClient } from "@/lib/supabase/server";

export type WarrantyRow = {
  key: string; source: "vehicle" | "device" | "other"; item: string; who: string; provider: string | null;
  start: string | null; end: string | null; terms: string | null; proof: string | null; href: string; id?: string; attachments?: Attachment[];
};
export type Attachment = { path: string; name: string; role: "receipt" | "warranty info" };
export type WState = "needs_end" | "soon" | "active" | "expired";
export const SOON_DAYS = 45;
const iso = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null);
const today = () => new Date().toISOString().slice(0, 10);
export function stateOf(w: WarrantyRow): WState {
  if (!w.end) return "needs_end";
  const t = today();
  if (w.end < t) return "expired";
  const days = Math.round((Date.parse(w.end) - Date.parse(t)) / 86400_000);
  return days <= SOON_DAYS ? "soon" : "active";
}

type Sb = Awaited<ReturnType<typeof createClient>>;

export async function collectWarranties(sb: Sb): Promise<WarrantyRow[]> {
  const out: WarrantyRow[] = [];
  const [{ data: vs }, { data: ds }, { data: ws }, { data: ps }] = await Promise.all([
    sb.from("vehicles").select("id,short,details"),
    sb.from("devices").select("id,name,make,person,warranty_end,plan_name,plan_end"),
    sb.from("warranties").select("*").order("end_date", { ascending: true, nullsFirst: false }),
    sb.from("profiles").select("id,display_name"),
  ]);
  const names = new Map((ps ?? []).map((p) => [p.id as string, String(p.display_name ?? "")]));
  for (const v of vs ?? []) {
    const list = ((v.details as { warranties?: Record<string, string>[] } | null)?.warranties ?? []);
    list.forEach((w, i) => out.push({ key: `veh:${v.id}:${i}`, source: "vehicle", item: w.item || "Warranty", who: String(v.short), provider: w.provider || null, start: iso(w.start), end: iso(w.end), terms: w.terms || null, proof: w.proof || null, href: `/vehicles/${v.id}/edit` }));
  }
  for (const d of ds ?? []) {
    const who = d.person ? names.get(d.person as string) || "Someone" : "Household";
    if (d.warranty_end) out.push({ key: `dev:${d.id}:w`, source: "device", item: `${d.name} warranty`, who, provider: (d.make as string) || null, start: null, end: iso(d.warranty_end), terms: null, proof: null, href: "/devices" });
    if (d.plan_name && d.plan_end) out.push({ key: `dev:${d.id}:p`, source: "device", item: `${d.name}: ${d.plan_name}`, who, provider: null, start: null, end: iso(d.plan_end), terms: null, proof: null, href: "/devices" });
  }
  for (const w of ws ?? []) out.push({ key: `own:${w.id}`, source: "other", id: w.id as string, item: w.item as string, who: (w.for_who as string) || "Household", provider: (w.provider as string) || null, start: iso(w.start_date), end: iso(w.end_date), terms: (w.terms as string) || null, proof: (w.proof as string) || null, href: "/warranties", attachments: (w.attachments as Attachment[] | null) ?? [] });
  return out;
}

// One reminder per warranty, about 30 days before it ends ("extend or let it lapse"). Safe to run repeatedly.
export async function ensureReminders(sb: Sb, userId: string, rows: WarrantyRow[]) {
  const due = rows.filter((w) => w.end && stateOf(w) === "soon");
  if (!due.length) return;
  const { data: have } = await sb.from("tasks").select("origin_ref").eq("origin_kind", "warranty").in("origin_ref", due.map((w) => `${w.key}@${w.end}`));
  const seen = new Set((have ?? []).map((t) => t.origin_ref as string));
  for (const w of due) {
    const ref = `${w.key}@${w.end}`;
    if (seen.has(ref)) continue;
    const dueAt = new Date(Math.max(Date.now(), Date.parse(w.end!) - 30 * 86400_000));
    await sb.from("tasks").insert({ person: userId, kind: "decide", title: `${w.item} (${w.who}) warranty ends ${w.end}: extend or let it lapse`, summary: w.terms ?? null, origin_kind: "warranty", origin_ref: ref, due_at: dueAt.toISOString(), tier: 2 }).then(() => {}, () => {});
  }
}

// A warranty with no end date gets ONE task until the date is added (task completes itself) or the person dismisses it.
// Done or dismissed tasks are never recreated.
export async function ensureEndDateTasks(sb: Sb, userId: string, rows: WarrantyRow[]) {
  const suffix = "@needs_end";
  const needs = rows.filter((w) => !w.end);
  const { data: all } = await sb.from("tasks").select("id,origin_ref,status").eq("origin_kind", "warranty").like("origin_ref", `%${suffix}`);
  const byRef = new Map((all ?? []).map((t) => [t.origin_ref as string, t]));
  for (const w of needs) {
    const ref = `${w.key}${suffix}`;
    if (byRef.has(ref)) continue;
    await sb.from("tasks").insert({ person: userId, kind: "do", title: `Add the end date for the ${w.item} warranty (${w.who})`, summary: w.source === "vehicle" ? "The paper didn’t give an end date. Open the vehicle, Edit details, Warranties." : "No end date yet. Open Warranties and add it, or dismiss this if it has none.", origin_kind: "warranty", origin_ref: ref, due_at: new Date().toISOString(), tier: 2 }).then(() => {}, () => {});
  }
  // Finished: the date is now there, or the warranty no longer exists.
  const haveEnd = new Set(rows.filter((w) => w.end).map((w) => w.key));
  const known = new Set(rows.map((w) => w.key));
  for (const t of all ?? []) {
    if (t.status !== "open" && t.status !== "snoozed") continue;
    const key = String(t.origin_ref).slice(0, -suffix.length);
    if (haveEnd.has(key)) await sb.from("tasks").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", t.id).then(() => {}, () => {});
    else if (!known.has(key)) await sb.from("tasks").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", t.id).then(() => {}, () => {});
  }
}

export async function syncWarrantyTasks(sb: Sb, userId: string) {
  const rows = await collectWarranties(sb);
  await ensureReminders(sb, userId, rows);
  await ensureEndDateTasks(sb, userId, rows);
  return rows;
}
