import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { CatalogView, AreaView } from "@/lib/catalog-shared";

type Ph = { removed_at: string | null };
export async function getCatalog(): Promise<CatalogView> {
  const empty: CatalogView = { started: false, completedAt: null, outcome: null, areas: [], totalItems: 0, unassigned: 0 };
  if (!hasSupabaseEnv()) return empty;
  const sb = await createClient();
  const [{ data: task }, { data: areas }, { data: items }] = await Promise.all([
    sb.from("guided_tasks").select("started_at, completed_at, outcome").eq("key", "catalog").maybeSingle(),
    sb.from("catalog_areas").select("id, name, sort, state, nothing_here, created_at").is("archived_at", null).order("sort").order("created_at"),
    sb.from("items").select("id, area_id, item_photos(removed_at)").is("deleted_at", null).eq("status", "active").limit(5000),
  ]);
  const by = new Map<string, { n: number; p: number }>();
  let unassigned = 0;
  for (const it of items ?? []) {
    const has = ((it.item_photos ?? []) as Ph[]).some((p) => !p.removed_at);
    if (!it.area_id) { unassigned++; continue; }
    const c = by.get(it.area_id) ?? { n: 0, p: 0 }; c.n++; if (has) c.p++; by.set(it.area_id, c);
  }
  const list: AreaView[] = (areas ?? []).map((a) => ({ id: a.id, name: a.name, done: a.state === "done", nothingHere: a.nothing_here, items: by.get(a.id)?.n ?? 0, withPhoto: by.get(a.id)?.p ?? 0 }));
  return { started: !!task, completedAt: task?.completed_at ?? null, outcome: (task?.outcome as CatalogView["outcome"]) ?? null, areas: list, totalItems: (items ?? []).length, unassigned };
}

// Today card: shown when the catalog task is not finished and this person has not put it off. Connection cards come first (one card at a time).
export async function getCatalogNudge(): Promise<{ show: boolean; started: boolean; done: number; total: number; next: string | null }> {
  const none = { show: false, started: false, done: 0, total: 0, next: null as string | null };
  if (!hasSupabaseEnv()) return none;
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser(); if (!user) return none;
    const [v, { data: dis }] = await Promise.all([getCatalog(), sb.from("setup_dismissals").select("until").eq("person", user.id).eq("step", "catalog").gt("until", new Date().toISOString()).maybeSingle()]);
    if (v.completedAt || dis) return { ...none, started: v.started };
    const open = v.areas.filter((a) => !a.done);
    return { show: true, started: v.started, done: v.areas.length - open.length, total: v.areas.length, next: open[0]?.name ?? null };
  } catch { return none; }
}
