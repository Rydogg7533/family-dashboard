"use server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { SECTIONS } from "@/lib/sitter-shared";

type Res = { ok: boolean; error?: string; note?: string; token?: string; link?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const SEC = new Set<string>(SECTIONS.map((s) => s.id));
const service = () => createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function who() {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("role, display_name").eq("id", user.id).maybeSingle();
  return { sb, user, actor: user.email ?? "member", owner: prof?.role === "owner", name: prof?.display_name ?? user.email ?? "member" };
}
type W = NonNullable<Awaited<ReturnType<typeof who>>>;
const log = async (w: W, action: string, subject: string) => { await w.sb.from("activity_log").insert({ actor: w.actor, action, subject: subject.slice(0, 80), undoable: false }).then(() => {}, () => {}); };
const touch = () => { revalidatePath("/settings/sitter"); revalidatePath("/"); };
const ensureTask = async (w: W) => { const { data } = await w.sb.from("guided_tasks").select("key").eq("key", "sitter_sheet").maybeSingle(); if (!data) await w.sb.from("guided_tasks").insert({ key: "sitter_sheet", started_by: w.actor }); };

export async function addSheetItem(section: string, text: string, thingItemId?: string | null, defaultOn?: boolean): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  if (!SEC.has(section)) return { ok: false, error: "Unknown section." };
  const tx = text.trim().slice(0, 400); if (!tx) return { ok: false, error: "Write what the sitter should see." };
  const { count } = await w.sb.from("sitter_sheet_items").select("id", { count: "exact", head: true }).eq("section", section).is("archived_at", null);
  const { error } = await w.sb.from("sitter_sheet_items").insert({ section, text: tx, thing_item_id: thingItemId && UUID.test(thingItemId) ? thingItemId : null, default_on: section === "health" ? false : defaultOn !== false, sort: (count ?? 0) + 1, created_by: w.actor });
  if (error) return { ok: false, error: error.message };
  await ensureTask(w); await log(w, "sitter_item_added", section); touch();
  return { ok: true };
}

export async function updateSheetItem(id: string, text: string, defaultOn: boolean): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown item." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const tx = text.trim().slice(0, 400); if (!tx) return { ok: false, error: "Write what the sitter should see." };
  const { data: cur } = await w.sb.from("sitter_sheet_items").select("section").eq("id", id).maybeSingle();
  const { error } = await w.sb.from("sitter_sheet_items").update({ text: tx, default_on: cur?.section === "health" ? false : defaultOn }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_item_edited", "item"); touch();
  return { ok: true };
}

// Hidden, never deleted.
export async function archiveSheetItem(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown item." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("sitter_sheet_items").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_item_hidden", "item"); touch();
  return { ok: true };
}

export async function listThingsForPicker(q: string): Promise<{ id: string; name: string }[]> {
  const w = await who(); if (!w) return [];
  let query = w.sb.from("items").select("id, name").is("deleted_at", null).eq("status", "active").order("name").limit(20);
  const term = q.trim().replace(/[%,()]/g, " ").slice(0, 40); if (term) query = query.ilike("name", `%${term}%`);
  const { data } = await query;
  return (data ?? []) as { id: string; name: string }[];
}

// A section is done when it has an item, or skipped when the person says so. Contacts cannot be skipped: a sitter must be able to reach you.
export async function setSectionState(section: string, state: "todo" | "done" | "skipped"): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const def = SECTIONS.find((s) => s.id === section); if (!def) return { ok: false, error: "Unknown section." };
  if (state === "skipped" && !def.canSkip) return { ok: false, error: "Emergency contacts cannot be skipped." };
  if (state === "done") {
    const { count } = await w.sb.from("sitter_sheet_items").select("id", { count: "exact", head: true }).eq("section", section).is("archived_at", null);
    if (!count) return { ok: false, error: "Add at least one item first, or skip this section." };
  }
  const { error } = await w.sb.from("sitter_sheet_sections").upsert({ section, state, updated_by: w.actor, updated_at: new Date().toISOString() }, { onConflict: "section" });
  if (error) return { ok: false, error: error.message };
  await ensureTask(w);
  if (state === "todo") await w.sb.from("guided_tasks").update({ completed_at: null, completed_by: null, outcome: null, gaps: null, updated_at: new Date().toISOString() }).eq("key", "sitter_sheet");
  await log(w, "sitter_section_" + state, section); touch();
  return { ok: true };
}

// Finish check, read from the database: every section done or skipped, and contacts done with at least one item.
export async function finishSitterSheet(): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const [{ data: secs }, { data: items }] = await Promise.all([w.sb.from("sitter_sheet_sections").select("section, state"), w.sb.from("sitter_sheet_items").select("section").is("archived_at", null)]);
  const st = Object.fromEntries((secs ?? []).map((s) => [s.section, s.state])); const has = new Set((items ?? []).map((i) => i.section));
  const open = SECTIONS.filter((s) => !(st[s.id] === "done" || st[s.id] === "skipped"));
  if (open.length) return { ok: false, error: `Not finished yet: ${open.map((s) => s.title).join(", ")}.` };
  if (st.contacts !== "done" || !has.has("contacts")) return { ok: false, error: "Emergency contacts need at least one entry." };
  const skipped = SECTIONS.filter((s) => st[s.id] === "skipped").length;
  await ensureTask(w);
  const { error } = await w.sb.from("guided_tasks").update({ completed_at: new Date().toISOString(), completed_by: w.actor, outcome: skipped ? "complete_with_gaps" : "complete", gaps: skipped, updated_at: new Date().toISOString() }).eq("key", "sitter_sheet");
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_sheet_finished", `${skipped} section(s) skipped`); touch();
  return { ok: true, note: skipped ? `Finished. ${skipped} section${skipped === 1 ? " was" : "s were"} skipped; you can fill them in any time.` : "Finished. Your sitter sheet is ready." };
}

// Card on Today: hide for 7 days (same table and rules as the other set-up cards).
export async function dismissGuidedCard(step: "catalog" | "sitter_sheet"): Promise<Res> {
  if (step !== "catalog" && step !== "sitter_sheet") return { ok: false, error: "Unknown card." };
  const w = await who(); if (!w) return { ok: false, error: "Sign in again." };
  const now = new Date(), until = new Date(now.getTime() + 7 * 864e5).toISOString();
  const { data: cur } = await w.sb.from("setup_dismissals").select("step").eq("person", w.user.id).eq("step", step).maybeSingle();
  const { error } = cur ? await w.sb.from("setup_dismissals").update({ until, updated_at: now.toISOString() }).eq("person", w.user.id).eq("step", step)
    : await w.sb.from("setup_dismissals").insert({ person: w.user.id, step, until, updated_at: now.toISOString() });
  if (error) return { ok: false, error: "Could not save. Try again." };
  revalidatePath("/");
  return { ok: true };
}

// Kitchen tablet pairing. The token is a credential: the table is closed to browsers, the token is shown once and only as a link.
export async function issueKitchenToken(label: string): Promise<Res> {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Not available in sample mode." };
  const w = await who(); if (!w) return { ok: false, error: "Sign in again." };
  if (!w.owner) return { ok: false, error: "Only a parent with the owner role can pair a tablet." };
  const name = String(label || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "Kitchen tablet";
  const svc = service();
  const { data: active } = await svc.from("device_tokens").select("id").eq("kind", "kitchen").is("revoked_at", null);
  if ((active?.length ?? 0) >= 3) return { ok: false, error: "You already have 3 paired tablets. Stop one first." };
  const token = randomBytes(32).toString("base64url");
  const { error } = await svc.from("device_tokens").insert({ kind: "kitchen", label: name, person: null, token, home_network_only: false });
  if (error) { console.error("issueKitchenToken:", error.code, error.message); return { ok: false, error: "Could not make a token. Try again." }; }
  await log(w, "kitchen_token_issued", `${w.name} paired "${name}"`);
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  revalidatePath("/settings/tablet");
  return { ok: true, token, link: `https://${host}/sitter/pair?token=${token}` };
}

export async function stopKitchenToken(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown tablet." };
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Not available in sample mode." };
  const w = await who(); if (!w) return { ok: false, error: "Sign in again." };
  if (!w.owner) return { ok: false, error: "Only a parent with the owner role can stop a tablet." };
  const { data, error } = await service().from("device_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("kind", "kitchen").is("revoked_at", null).select("label");
  if (error || !data?.length) return { ok: false, error: "Could not stop that tablet." };
  await log(w, "kitchen_token_stopped", `${w.name} stopped "${data[0].label}"`);
  revalidatePath("/settings/tablet");
  return { ok: true };
}
