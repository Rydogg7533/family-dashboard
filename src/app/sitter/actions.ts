"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { localToIso } from "@/lib/google-calendar";
import { SECTIONS, type SheetItem } from "@/lib/sitter-shared";

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
function check(x: Times): string | null {
  if (!(x.endsAt > x.leaveAt)) return "The back-by time has to be after the leave-by time.";
  if (x.endsAt.getTime() - x.leaveAt.getTime() > 24 * 3600e3) return "A sitter night can be at most 24 hours.";
  if (x.endsAt.getTime() < Date.now()) return "That night is already over.";
  return null;
}
async function insertNight(w: NonNullable<Awaited<ReturnType<typeof who>>>, v: { title: string; place?: string | null; sitterName?: string | null; eventKey?: string | null; source: "marked" | "told"; times: Times }): Promise<Res> {
  const now = Date.now(), due = v.times.leaveAt.getTime() <= now;
  const { data, error } = await w.sb.from("sitter_nights").insert({
    title: v.title, place: v.place ?? null, sitter_name: v.sitterName ?? null, event_key: v.eventKey ?? null, source: v.source,
    starts_at: v.times.startsAt.toISOString(), leave_at: v.times.leaveAt.toISOString(), ends_at: v.times.endsAt.toISOString(),
    status: due ? "awaiting_review" : "scheduled", prompted_at: due ? new Date().toISOString() : null, prompt_to: w.user.id, created_by: w.user.id,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "A sitter night already exists for that event." : error?.message ?? "Could not save." };
  await log(w, "sitter_night_added", `${v.title} (${v.source})`, data.id);
  touch(data.id);
  return { ok: true, id: data.id, review: due };
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
export async function createToldNight(i: { title: string; place?: string; sitterName?: string; date: string; leaveTime: string; backTime: string }): Promise<Res> {
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date) || !/^\d{2}:\d{2}$/.test(i.leaveTime) || !/^\d{2}:\d{2}$/.test(i.backTime)) return { ok: false, error: "Pick a date and both times." };
  const leave = new Date(localToIso(i.date, i.leaveTime)); let back = new Date(localToIso(i.date, i.backTime));
  if (back <= leave) back = new Date(back.getTime() + 24 * 3600e3);
  const times = { startsAt: leave, leaveAt: leave, endsAt: back };
  const bad = check(times); if (bad) return { ok: false, error: bad };
  return insertNight(w, { title: (i.title.trim() || "Sitter tonight").slice(0, 200), place: t(i.place, 200), sitterName: t(i.sitterName, 60), source: "told", times });
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
  const { error } = await w.sb.from("sitter_nights").update({ status: "cancelled", visit_only: null }).eq("id", id).in("status", ["proposed", "scheduled", "awaiting_review", "confirmed"]);
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
export async function confirmNight(id: string, items: SheetItem[], visitOnly: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown night." };
  const w = await who(); if (!w) return { ok: false, error: "Not signed in or not available in preview." };
  const secs = new Set<string>(SECTIONS.map((s) => s.id));
  const clean = (items ?? []).filter((x) => x && x.on && typeof x.text === "string" && x.text.trim() && secs.has(x.section)).slice(0, 80)
    .map((x) => ({ id: String(x.id).slice(0, 60), section: x.section, text: x.text.trim().slice(0, 400), photo: x.photo && UUID.test(x.photo) ? x.photo : null, on: true }));
  const { data: n } = await w.sb.from("sitter_nights").select("status, ends_at").eq("id", id).maybeSingle();
  if (!n || !["scheduled", "awaiting_review", "confirmed"].includes(n.status)) return { ok: false, error: "This night is not waiting for confirmation." };
  if (new Date(n.ends_at) <= new Date()) return { ok: false, error: "This night has already ended." };
  const { error } = await w.sb.from("sitter_nights").update({ status: "confirmed", sheet: clean, visit_only: t(visitOnly, 600), confirmed_by: w.user.id, confirmed_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_night_confirmed", `${clean.length} items on the tablet`, id); touch(id);
  return { ok: true, id };
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
