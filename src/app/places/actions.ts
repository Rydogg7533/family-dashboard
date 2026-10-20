"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

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
