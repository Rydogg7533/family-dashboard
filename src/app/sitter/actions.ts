"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { type SheetItem } from "@/lib/sitter-shared";
import { checkTimes, createNight as createNightLib, insertNight as insertNightLib, bookNight as bookNightLib, type NightCtx } from "@/lib/sitter-nights";
import { choiceOptions, compileFor, type Choices } from "@/lib/sitter-compile";

type Res = { ok: boolean; error?: string; id?: string; review?: boolean };
const UUID = /^[0-9a-f-]{36}$/i;

async function who() {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user ? { sb, user, actor: user.email ?? "member" } : null;
}
const log = async (w: NonNullable<Awaited<ReturnType<typeof who>>>, action: string, subject: string, ref?: string) => { await w.sb.from("activity_log").insert({ actor: w.actor, action, subject: subject.slice(0, 80), ref: ref ?? null, undoable: false }).then(() => {}, () => {}); };
const t = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n) || null;
const touch = (id?: string) => { revalidatePath("/"); revalidatePath("/settings/sitter"); if (id) revalidatePath(`/sitter/review/${id}`); revalidatePath("/sitter"); };

type Times = { leaveAt: Date; startsAt: Date; endsAt: Date };
const check = checkTimes;
const ctxOf = (w: NonNullable<Awaited<ReturnType<typeof who>>>): NightCtx => ({ sb: w.sb, userId: w.user.id, actor: w.actor });
async function insertNight(w: NonNullable<Awaited<ReturnType<typeof who>>>, v: { title: string; place?: string | null; sitterName?: string | null; eventKey?: string | null; source: "marked" | "told"; times: Times }): Promise<Res> {
  const r = await insertNightLib(ctxOf(w), v); if (r.ok) touch(r.id); return r;
}

// Way 1: a calendar event marked "Sitter". Leave-by and back-by are minutes around the event.
export async function markEventNight(i: { eventKey: string; title: string; place?: string; sitterName?: string; startIso: string; endIso: string; leaveMinutes: number; backMinutes: number }): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const s = new Date(i.startIso), e = new Date(i.endIso);
  if (isNaN(+s) || isNaN(+e) || !i.eventKey || !i.title.trim()) return { ok: false, error: "That event could not be read." };
  const lm = Math.min(240, Math.max(0, Math.round(i.leaveMinutes))), bm = Math.min(240, Math.max(0, Math.round(i.backMinutes)));
  const times = { startsAt: s, leaveAt: new Date(s.getTime() - lm * 60e3), endsAt: new Date(e.getTime() + bm * 60e3) };
  const bad = check(times); if (bad) return { ok: false, error: bad };
  return insertNight(w, { title: i.title.trim().slice(0, 200), place: t(i.place, 200), sitterName: t(i.sitterName, 60), eventKey: i.eventKey.slice(0, 300), source: "marked", times });
}

// Way 3: tell the app directly. Times are on the household clock; a back-by earlier than leave-by means the next day.
// sitterPersonId: an approved sitter picked from the list; a typed name is matched to the list when it is unambiguous.
export async function createToldNight(i: { title: string; place?: string; sitterName?: string; sitterPersonId?: string | null; date: string; leaveTime: string; backTime: string; needed?: boolean }): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const r = await createNightLib(ctxOf(w), { title: i.title || "", place: i.place, sitterName: i.sitterName, sitterPersonId: i.sitterPersonId, date: i.date, leaveTime: i.leaveTime, backTime: i.backTime, needed: i.needed });
  if (r.ok) touch(r.id);
  return r;
}

// "Emma's in": a needed night gets its sitter.
export async function bookNight(id: string, sitterName: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown night." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const r = await bookNightLib(ctxOf(w), id, sitterName); if (r.ok) touch(id); return r;
}

// Way 2: the app noticed an evening event with no kids on it and asked. Yes schedules it (and you will be prompted); No is remembered.
export async function answerProposal(id: string, yes: boolean, sitterName?: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown night." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { data: n } = await w.sb.from("sitter_nights").select("status, leave_at, ends_at").eq("id", id).maybeSingle();
  if (!n || n.status !== "proposed") return { ok: false, error: "That question was already answered." };
  const due = new Date(n.leave_at) <= new Date();
  const patch = yes ? (due ? { status: "awaiting_review", prompted_at: new Date().toISOString() } : { status: "scheduled" }) : { status: "declined" };
  const { error } = await w.sb.from("sitter_nights").update({ ...patch, prompt_to: w.user.id, sitter_name: yes ? t(sitterName, 60) : null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, yes ? "sitter_night_confirmed_yes" : "sitter_night_declined", "proposal", id);
  touch(id);
  return { ok: true, id, review: yes && due };
}

export async function cancelNight(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown night." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("sitter_nights").update({ status: "cancelled", visit_only: null }).eq("id", id).in("status", ["needed", "proposed", "scheduled", "awaiting_review", "confirmed"]);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_night_cancelled", "night", id); touch(id);
  return { ok: true };
}

// End the visit now: the tablet goes back to normal and the one-visit info is cleared.
export async function endNight(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown night." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { error } = await w.sb.from("sitter_nights").update({ status: "ended", ended_at: new Date().toISOString(), visit_only: null }).eq("id", id).in("status", ["awaiting_review", "confirmed"]);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_night_ended", "night", id); touch(id);
  return { ok: true };
}

// Confirm exactly what the tablet will show: the included items (edited, added or removed for this visit) and the one-visit info.
// choices: which templates and children the sheet was compiled from, saved with the night so "same as last time" works and so
// a needed night keeps its draft. A needed night is not confirmed (no sitter yet): its sheet and choices are saved as a draft.
export async function confirmNight(id: string, items: SheetItem[], visitOnly: string, choices?: Choices): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown night." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const clean = (items ?? []).filter((x) => x && x.on && typeof x.text === "string" && x.text.trim() && typeof x.section === "string" && x.section.length <= 60).slice(0, 120)
    .map((x) => ({ id: String(x.id).slice(0, 60), section: x.section, label: typeof x.label === "string" ? x.label.slice(0, 60) : undefined, health: !!x.health, text: x.text.trim().slice(0, 400), photo: x.photo && UUID.test(x.photo) ? x.photo : null, on: true }));
  const { data: n } = await w.sb.from("sitter_nights").select("status, ends_at").eq("id", id).maybeSingle();
  if (!n || !["needed", "scheduled", "awaiting_review", "confirmed"].includes(n.status)) return { ok: false, error: "This night is not waiting for confirmation." };
  if (new Date(n.ends_at) <= new Date()) return { ok: false, error: "This night has already ended." };
  const ch = choices ? { general_template_id: choices.generalTemplateId && UUID.test(choices.generalTemplateId) ? choices.generalTemplateId : null, child_templates: Object.fromEntries(Object.entries(choices.childTemplates ?? {}).filter(([k, v]) => UUID.test(k) && UUID.test(String(v)))), children_home: (choices.childrenHome ?? []).filter((x) => UUID.test(x)), draft: { lines: (choices.lines ?? []).map((x) => String(x).trim().slice(0, 400)).filter(Boolean).slice(0, 20) }, instructions_mode: "template", prepared_at: new Date().toISOString() } : {};
  const draftOnly = n.status === "needed";
  const { error } = await w.sb.from("sitter_nights").update(draftOnly ? { sheet: clean, ...ch } : { status: "confirmed", sheet: clean, visit_only: t(visitOnly, 600), confirmed_by: w.user.id, confirmed_at: new Date().toISOString(), ...ch }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, draftOnly ? "sitter_draft_saved" : "sitter_night_confirmed", `${clean.length} items on the tablet`, id); touch(id);
  return { ok: true, id };
}

// The review screen asks for a fresh compile when the parent changes a template or who is home.
export async function recompileNight(choices: Choices): Promise<{ ok: boolean; items?: SheetItem[]; error?: string }> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const opts = await choiceOptions();
  return { ok: true, items: await compileFor(choices, opts) };
}

export async function saveNote(id: string, note: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown night." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const { data, error } = await w.sb.from("sitter_nights").update({ note: t(note, 600), note_by: w.user.id, note_at: new Date().toISOString() }).eq("id", id).eq("status", "confirmed").select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Confirm the sheet first; the note goes with it." };
  await log(w, "sitter_note", "note for the sitter", id); touch(id);
  return { ok: true };
}
