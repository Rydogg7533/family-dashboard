"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/data-catalog";
import { evaluate } from "@/lib/catalog-shared";

type Res = { ok: boolean; error?: string; note?: string; gaps?: { name: string; missing: number }[] };

async function who() {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user ? { sb, user, actor: user.email ?? "member" } : null;
}
const log = async (w: NonNullable<Awaited<ReturnType<typeof who>>>, action: string, subject: string) => { await w.sb.from("activity_log").insert({ actor: w.actor, action, subject: subject.slice(0, 80), undoable: false }).then(() => {}, () => {}); };
const reopen = async (w: NonNullable<Awaited<ReturnType<typeof who>>>) => { await w.sb.from("guided_tasks").update({ completed_at: null, completed_by: null, outcome: null, gaps: null, updated_at: new Date().toISOString() }).eq("key", "catalog"); };
const touch = () => { revalidatePath("/things/catalog"); revalidatePath("/things"); revalidatePath("/"); };

// Start the task (or add more areas to it). Adding an area to a finished catalog reopens it, so "done" always means done for the areas that exist.
export async function addCatalogAreas(names: string[]): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const clean = Array.from(new Set(names.map((n) => n.trim().replace(/\s+/g, " ").slice(0, 60)).filter(Boolean))).slice(0, 30);
  if (!clean.length) return { ok: false, error: "Pick at least one area." };
  const { data: have } = await w.sb.from("catalog_areas").select("name, sort").is("archived_at", null);
  const existing = new Set((have ?? []).map((a) => a.name.toLowerCase()));
  let sort = Math.max(0, ...(have ?? []).map((a) => a.sort)) + 1;
  const fresh = clean.filter((n) => !existing.has(n.toLowerCase())).map((name) => ({ name, sort: sort++ }));
  if (fresh.length) { const { error } = await w.sb.from("catalog_areas").insert(fresh); if (error) return { ok: false, error: error.message }; }
  const { data: task } = await w.sb.from("guided_tasks").select("key, completed_at").eq("key", "catalog").maybeSingle();
  if (!task) await w.sb.from("guided_tasks").insert({ key: "catalog", started_by: w.actor });
  else if (task.completed_at && fresh.length) await reopen(w);
  await log(w, "catalog_areas_added", `${fresh.length} area(s)`);
  touch();
  return { ok: true };
}

// An area is done when it has at least one item, or the person says there is nothing to catalog there.
export async function setAreaDone(areaId: string, nothingHere: boolean): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { count } = await w.sb.from("items").select("id", { count: "exact", head: true }).eq("area_id", areaId).eq("status", "active").is("deleted_at", null);
  if ((count ?? 0) === 0 && !nothingHere) return { ok: false, error: "No items here yet. Add some, or confirm there is nothing to catalog in this area." };
  const { error } = await w.sb.from("catalog_areas").update({ state: "done", nothing_here: (count ?? 0) === 0, done_at: new Date().toISOString(), done_by: w.actor }).eq("id", areaId);
  if (error) return { ok: false, error: error.message };
  await log(w, "catalog_area_done", (count ?? 0) === 0 ? "area (nothing there)" : `area (${count} items)`);
  touch();
  return { ok: true };
}

export async function reopenArea(areaId: string): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("catalog_areas").update({ state: "todo", nothing_here: false, done_at: null, done_by: null }).eq("id", areaId);
  if (error) return { ok: false, error: error.message };
  await reopen(w); await log(w, "catalog_area_reopened", "area");
  touch();
  return { ok: true };
}

// Hidden, never deleted. Items in it keep existing and simply have no area.
export async function archiveArea(areaId: string): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("catalog_areas").update({ archived_at: new Date().toISOString() }).eq("id", areaId);
  if (error) return { ok: false, error: error.message };
  await log(w, "catalog_area_archived", "area"); touch();
  return { ok: true };
}

// Checks the finish rule against the database, not against what the screen last showed. Gaps need an explicit "finish anyway".
export async function finishCatalog(finishWithGaps: boolean): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const v = await getCatalog(); const e = evaluate(v);
  if (!v.started || v.areas.length === 0) return { ok: false, error: "Pick the areas first." };
  if (!e.ready) return { ok: false, error: `${e.open.length} area${e.open.length === 1 ? " is" : "s are"} not marked done yet: ${e.open.map((a) => a.name).join(", ")}.` };
  if (e.gaps > 0 && !finishWithGaps) return { ok: false, error: `${e.gaps} item${e.gaps === 1 ? " has" : "s have"} no photo.`, gaps: e.gapAreas.map((a) => ({ name: a.name, missing: a.items - a.withPhoto })) };
  const { error } = await w.sb.from("guided_tasks").update({ completed_at: new Date().toISOString(), completed_by: w.actor, outcome: e.outcome, gaps: e.gaps, updated_at: new Date().toISOString() }).eq("key", "catalog");
  if (error) return { ok: false, error: error.message };
  await log(w, "catalog_finished", `${e.outcome}, ${e.gaps} gap(s), ${v.totalItems} items`);
  touch();
  return { ok: true, note: e.gaps ? `Finished with ${e.gaps} item${e.gaps === 1 ? "" : "s"} still missing a photo.` : "Finished. Every item has a photo." };
}

export async function reopenCatalog(): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  await reopen(w); await log(w, "catalog_reopened", "catalog"); touch();
  return { ok: true };
}

// "Not now" on the Today card for the catalog task: hide it for 7 days. Same table and rules as the connection cards.
export async function dismissCatalogCard(): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Sign in again." };
  const now = new Date(), until = new Date(now.getTime() + 7 * 864e5).toISOString();
  const { data: cur } = await w.sb.from("setup_dismissals").select("step").eq("person", w.user.id).eq("step", "catalog").maybeSingle();
  const { error } = cur ? await w.sb.from("setup_dismissals").update({ until, updated_at: now.toISOString() }).eq("person", w.user.id).eq("step", "catalog")
    : await w.sb.from("setup_dismissals").insert({ person: w.user.id, step: "catalog", until, updated_at: now.toISOString() });
  if (error) return { ok: false, error: "Could not save. Try again." };
  revalidatePath("/");
  return { ok: true };
}
