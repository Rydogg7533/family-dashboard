"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { checkPlaceName } from "@/lib/place-candidates";

type Result = { ok: boolean; error?: string };

// All three act only on the signed-in person's own Places (RLS), log one line without contents, and relabel the
// person's day record so the Day page agrees with the register. Nothing here calls a model.

async function who() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb.from("profiles").select("display_name").eq("id", user.id).single();
  return { sb, id: user.id, name: profile?.display_name ?? "Member" };
}

export async function renamePlace(placeId: string, newName: string): Promise<Result> {
  const name = (newName || "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the place a name." };
  if (!hasSupabaseEnv()) return { ok: true };
  const me = await who(); if (!me) return { ok: false, error: "Not signed in." };
  const { data: pl } = await me.sb.from("places").select("id, name, person").eq("id", placeId).single();
  if (!pl || pl.person !== me.id) return { ok: false, error: "Not your place." };
  const { error } = await me.sb.from("places").update({ name, meaning: name, confirmed: true, updated_by: me.name, updated_at: new Date().toISOString() }).eq("id", placeId);
  if (error) return { ok: false, error: error.message };
  await me.sb.from("day_blocks").update({ place: name }).eq("place_id", placeId).eq("person", me.id);
  await me.sb.from("day_blocks").update({ title: name }).eq("place_id", placeId).eq("person", me.id).eq("title", pl.name);
  await me.sb.from("activity_log").insert({ actor: me.name, action: "place_renamed", subject: `Place renamed to ${name}`, ref: placeId, undoable: true }).then(() => {}, () => {});
  return { ok: true };
}

// Merge `fromId` into `intoId`: stops and blocks move to the survivor, visits add up, the other Place is deleted.
export async function mergePlace(fromId: string, intoId: string): Promise<Result> {
  if (!fromId || !intoId || fromId === intoId) return { ok: false, error: "Pick a different place to merge into." };
  if (!hasSupabaseEnv()) return { ok: true };
  const me = await who(); if (!me) return { ok: false, error: "Not signed in." };
  const { data: rows } = await me.sb.from("places").select("id, name, person, visits").in("id", [fromId, intoId]);
  const from = rows?.find((r) => r.id === fromId), into = rows?.find((r) => r.id === intoId);
  if (!from || !into || from.person !== me.id || into.person !== me.id) return { ok: false, error: "Not your places." };
  await me.sb.from("location_stops").update({ place_id: intoId }).eq("place_id", fromId).eq("person", me.id);
  await me.sb.from("day_blocks").update({ place_id: intoId, place: into.name }).eq("place_id", fromId).eq("person", me.id);
  await me.sb.from("places").update({ visits: (into.visits ?? 0) + (from.visits ?? 0), confirmed: true, updated_by: me.name, updated_at: new Date().toISOString() }).eq("id", intoId);
  const { error } = await me.sb.from("places").delete().eq("id", fromId);
  if (error) return { ok: false, error: error.message };
  await me.sb.from("activity_log").insert({ actor: me.name, action: "place_merged", subject: `Merged ${from.name} into ${into.name}`, ref: intoId, undoable: false }).then(() => {}, () => {});
  return { ok: true };
}

// Forget: the Place goes; its stops and blocks keep their times and lose the label, so the agent may ask again.
export async function forgetPlace(placeId: string): Promise<Result> {
  if (!hasSupabaseEnv()) return { ok: true };
  const me = await who(); if (!me) return { ok: false, error: "Not signed in." };
  const { data: pl } = await me.sb.from("places").select("id, name, person").eq("id", placeId).single();
  if (!pl || pl.person !== me.id) return { ok: false, error: "Not your place." };
  await me.sb.from("day_blocks").update({ place: null, place_id: null, kind: "unknown", confidence: 0.3 }).eq("place_id", placeId).eq("person", me.id).neq("kind", "calendar");
  const { error } = await me.sb.from("places").delete().eq("id", placeId);
  if (error) return { ok: false, error: error.message };
  await me.sb.from("activity_log").insert({ actor: me.name, action: "place_forgotten", subject: `Forgot place ${pl.name}`, ref: placeId, undoable: false }).then(() => {}, () => {});
  return { ok: true };
}

// Naming, hiding or skipping a group of unnamed stops uses the same answer the Day page records (status "answered" + the answer text);
// the Mac mini's location agent turns it into a Place within about ten minutes and relabels the day record. One path, no second way to make a place.
async function answerStops(ids: string[], answer: string, log: string): Promise<Result> {
  if (!hasSupabaseEnv()) return { ok: true };
  const me = await who(); if (!me) return { ok: false, error: "Not signed in." };
  const clean = Array.from(new Set((ids ?? []).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 500);
  if (!clean.length) return { ok: false, error: "Nothing to update." };
  const { data, error } = await me.sb.from("location_stops").update({ status: "answered", answer, updated_at: new Date().toISOString() }).in("id", clean).eq("status", "question").eq("person", me.id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Those stops were already answered." };
  await me.sb.from("activity_log").insert({ actor: me.name, action: "place_stops_answered", subject: log.slice(0, 80), undoable: false }).then(() => {}, () => {});
  revalidatePath("/places"); revalidatePath("/day");
  return { ok: true };
}
export async function nameCandidate(ids: string[], rawName: string): Promise<Result> {
  const n = checkPlaceName(rawName);
  if (!n.ok) return { ok: false, error: n.error };
  if (/^(skip|personal|private|this was private)$/i.test(n.value)) return { ok: false, error: "Pick a different name; that word is used for hiding stops." };
  return answerStops(ids, n.value, `Named ${ids.length} stop${ids.length === 1 ? "" : "s"}: ${n.value}`);
}
export async function hideCandidate(ids: string[]): Promise<Result> { return answerStops(ids, "Private", `Marked ${ids.length} stop(s) private`); }
export async function skipCandidate(ids: string[]): Promise<Result> { return answerStops(ids, "Skip", `Skipped ${ids.length} stop(s)`); }

// "I'm here now": adds a confirmed place at the coordinates the browser reports. The agent recognises later visits within about 150 m.
export async function addPlaceHere(rawName: string, lat: number, lon: number): Promise<Result> {
  const n = checkPlaceName(rawName);
  if (!n.ok) return { ok: false, error: n.error };
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: "Could not read your location." };
  if (!hasSupabaseEnv()) return { ok: true };
  const me = await who(); if (!me) return { ok: false, error: "Not signed in." };
  const { data: dup } = await me.sb.from("places").select("id").eq("person", me.id).ilike("name", n.value).limit(1);
  if (dup?.length) return { ok: false, error: "You already have a place with that name." };
  const { error } = await me.sb.from("places").insert({ person: me.id, name: n.value, meaning: n.value, usual_activity: n.value, lat, lon, radius_m: 100, confirmed: true, added_by: "you", visits: 0 });
  if (error) return { ok: false, error: error.message };
  await me.sb.from("activity_log").insert({ actor: me.name, action: "place_added", subject: `Added place ${n.value}`, undoable: false }).then(() => {}, () => {});
  revalidatePath("/places");
  return { ok: true };
}
