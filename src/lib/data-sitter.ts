import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { startsOn, type Night, type NightStatus, type SectionId, type SheetItem, type TemplateItem } from "@/lib/sitter-shared";

type Row = Record<string, unknown>;
export const toNight = (r: Row): Night => ({
  id: r.id as string, eventKey: (r.event_key as string) ?? null, title: r.title as string, place: (r.place as string) ?? null, sitterName: (r.sitter_name as string) ?? null,
  startsAt: r.starts_at as string, leaveAt: r.leave_at as string, endsAt: r.ends_at as string, source: r.source as Night["source"], status: r.status as NightStatus,
  promptTo: (r.prompt_to as string) ?? null, confirmedAt: (r.confirmed_at as string) ?? null, sheet: ((r.sheet as SheetItem[]) ?? []), note: (r.note as string) ?? null, visitOnly: (r.visit_only as string) ?? null,
});

// The reusable template: active items with a photo id when linked to a catalog item.
export async function getTemplate(): Promise<TemplateItem[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("sitter_sheet_items").select("id, section, text, thing_item_id, default_on, sort, created_at").is("archived_at", null).order("sort").order("created_at");
  const ids = Array.from(new Set((data ?? []).map((r) => r.thing_item_id).filter((x): x is string => !!x)));
  const photo = new Map<string, string>(), name = new Map<string, string>();
  if (ids.length) {
    const [{ data: ph }, { data: its }] = await Promise.all([
      sb.from("item_photos").select("id, item_id, position").in("item_id", ids).is("removed_at", null).order("position"),
      sb.from("items").select("id, name").in("id", ids),
    ]);
    for (const p of ph ?? []) if (!photo.has(p.item_id)) photo.set(p.item_id, p.id);
    for (const i of its ?? []) name.set(i.id, i.name);
  }
  return (data ?? []).map((r) => ({ id: r.id, section: r.section as SectionId, text: r.text, thingItemId: r.thing_item_id, thingName: r.thing_item_id ? name.get(r.thing_item_id) ?? null : null, photo: r.thing_item_id ? photo.get(r.thing_item_id) ?? null : null, defaultOn: r.default_on }));
}

export const templateToSheet = (t: TemplateItem[]): SheetItem[] => t.map((i) => ({ id: i.id, section: i.section, text: i.text, photo: i.photo, on: startsOn(i.section, i.defaultOn) }));

export async function getSections(): Promise<Record<string, "todo" | "done" | "skipped">> {
  if (!hasSupabaseEnv()) return {};
  const sb = await createClient();
  const { data } = await sb.from("sitter_sheet_sections").select("section, state");
  return Object.fromEntries((data ?? []).map((r) => [r.section, r.state]));
}

export async function getNight(id: string): Promise<Night | null> {
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await createClient();
  const { data } = await sb.from("sitter_nights").select("*").eq("id", id).maybeSingle();
  return data ? toNight(data) : null;
}

export async function getNights(statuses: NightStatus[], limit = 20): Promise<Night[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("sitter_nights").select("*").in("status", statuses).order("starts_at", { ascending: statuses.includes("ended") ? false : true }).limit(limit);
  return (data ?? []).map(toNight);
}

export async function getNightForEvent(eventKey: string): Promise<Night | null> {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data } = await sb.from("sitter_nights").select("*").eq("event_key", eventKey).not("status", "in", "(declined,cancelled)").maybeSingle();
  return data ? toNight(data) : null;
}

// Today card for the sitter sheet setup task: only for households with children, until finished, and not while the person has put it off.
export async function getSitterSheetNudge(): Promise<{ show: boolean; done: number; total: number; next: string | null }> {
  const none = { show: false, done: 0, total: 0, next: null as string | null };
  if (!hasSupabaseEnv()) return none;
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser(); if (!user) return none;
    const [{ count: kids }, { data: task }, { data: dis }, states] = await Promise.all([
      sb.from("children").select("id", { count: "exact", head: true }).is("archived_at", null),
      sb.from("guided_tasks").select("completed_at").eq("key", "sitter_sheet").maybeSingle(),
      sb.from("setup_dismissals").select("until").eq("person", user.id).eq("step", "sitter_sheet").gt("until", new Date().toISOString()).maybeSingle(),
      getSections(),
    ]);
    if (!kids || task?.completed_at || dis) return none;
    const { SECTIONS } = await import("@/lib/sitter-shared");
    const open = SECTIONS.filter((s) => !(states[s.id] === "done" || states[s.id] === "skipped"));
    return { show: true, done: SECTIONS.length - open.length, total: SECTIONS.length, next: open[0]?.title ?? null };
  } catch { return none; }
}
