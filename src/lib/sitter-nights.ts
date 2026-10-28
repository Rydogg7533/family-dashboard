import "server-only";
// Making and changing sitter nights, shared by the buttons (src/app/sitter/actions.ts) and the Ask tools (src/lib/tools/sitter.ts).
import { localToIso, householdTz } from "@/lib/google-calendar";
import { getNight, getSitters } from "@/lib/data-sitter";
import { choiceOptions, defaultChoices } from "@/lib/sitter-compile";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NightCtx = { sb: SupabaseClient; userId: string; actor: string };
export type Res = { ok: boolean; error?: string; id?: string; review?: boolean };
type Times = { leaveAt: Date; startsAt: Date; endsAt: Date };
const t = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n) || null;

export async function nightLog(c: NightCtx, action: string, subject: string, ref?: string) {
  await c.sb.from("activity_log").insert({ actor: c.actor, action, subject: subject.slice(0, 80), ref: ref ?? null, undoable: false }).then(() => {}, () => {});
}

export function checkTimes(x: Times): string | null {
  if (!(x.endsAt > x.leaveAt)) return "The back-by time has to be after the leave-by time.";
  if (x.endsAt.getTime() - x.leaveAt.getTime() > 24 * 3600e3) return "A sitter night can be at most 24 hours.";
  if (x.endsAt.getTime() < Date.now()) return "That night is already over.";
  return null;
}

// "Emma" → the approved sitter whose contact name starts with it (one match only).
export async function matchSitter(name: string | null | undefined): Promise<{ id: string; name: string } | null | "ambiguous"> {
  const q = (name ?? "").trim().toLowerCase(); if (!q) return null;
  const all = (await getSitters()).filter((s) => s.approvedAt);
  const hits = all.filter((s) => s.name.toLowerCase() === q || s.name.toLowerCase().split(" ")[0] === q || s.name.toLowerCase().startsWith(q));
  if (hits.length === 1) return { id: hits[0].id, name: hits[0].name };
  return hits.length > 1 ? "ambiguous" : null;
}

export async function insertNight(c: NightCtx, v: { title: string; place?: string | null; sitterName?: string | null; sitterPersonId?: string | null; eventKey?: string | null; source: "marked" | "told"; times: Times; needed?: boolean; lines?: string[] }): Promise<Res> {
  const now = Date.now(), due = !v.needed && v.times.leaveAt.getTime() <= now;
  const { data, error } = await c.sb.from("sitter_nights").insert({
    title: v.title, place: v.place ?? null, sitter_name: v.sitterName ?? null, sitter_person_id: v.sitterPersonId ?? null, event_key: v.eventKey ?? null, source: v.source,
    starts_at: v.times.startsAt.toISOString(), leave_at: v.times.leaveAt.toISOString(), ends_at: v.times.endsAt.toISOString(),
    status: v.needed ? "needed" : due ? "awaiting_review" : "scheduled", prompted_at: due ? new Date().toISOString() : null, prompt_to: c.userId, created_by: c.userId,
    draft: v.lines?.length ? { lines: v.lines } : null,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "A sitter night already exists for that event." : error?.message ?? "Could not save." };
  await nightLog(c, v.needed ? "sitter_needed" : "sitter_night_added", `${v.title} (${v.source})`, data.id);
  return { ok: true, id: data.id, review: due };
}

// Times on the household clock; a back-by earlier than leave-by means the next day.
export async function toldTimes(date: string, leaveTime: string, backTime: string): Promise<Times | string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(leaveTime) || !/^\d{2}:\d{2}$/.test(backTime)) return "Pick a date and both times.";
  const tz = await householdTz();
  const leave = new Date(localToIso(date, leaveTime, tz)); let back = new Date(localToIso(date, backTime, tz));
  if (back <= leave) back = new Date(back.getTime() + 24 * 3600e3);
  const times = { startsAt: leave, leaveAt: leave, endsAt: back };
  return checkTimes(times) ?? times;
}

export async function createNight(c: NightCtx, i: { title?: string; place?: string; sitterName?: string; sitterPersonId?: string | null; date: string; leaveTime: string; backTime: string; needed?: boolean; lines?: string[] }): Promise<Res> {
  const times = await toldTimes(i.date, i.leaveTime, i.backTime); if (typeof times === "string") return { ok: false, error: times };
  let sitterPersonId = i.sitterPersonId ?? null, sitterName = t(i.sitterName, 60);
  if (!sitterPersonId && sitterName) { const m = await matchSitter(sitterName); if (m && m !== "ambiguous") { sitterPersonId = m.id; sitterName = m.name; } }
  const r = await insertNight(c, { title: (i.title?.trim() || (i.needed ? "Sitter needed" : "Sitter")).slice(0, 200), place: t(i.place, 200), sitterName, sitterPersonId, source: "told", times, needed: i.needed, lines: i.lines });
  if (r.ok && r.id && !i.needed) await applyDefaults(c, r.id);
  return r;
}

// A booked night with default templates is prepared the moment it is made (D3: zero questions), so the day-before nudge
// only fires when there is nothing to fall back on. The choices are saved; the review screen still lets the parent change them.
export async function applyDefaults(c: NightCtx, id: string) {
  const n = await getNight(id); if (!n) return;
  const opts = await choiceOptions();
  if (!opts.general.some((t) => t.isDefault)) return;
  const d = await defaultChoices(n, opts);
  await c.sb.from("sitter_nights").update({ general_template_id: d.generalTemplateId, child_templates: d.childTemplates, children_home: d.childrenHome, instructions_mode: "template", prepared_at: new Date().toISOString() }).eq("id", id);
}

// "Emma's in": a needed night gets its sitter and becomes scheduled.
export async function bookNight(c: NightCtx, id: string, sitterName: string): Promise<Res> {
  const { data: n } = await c.sb.from("sitter_nights").select("status, leave_at").eq("id", id).maybeSingle();
  if (!n) return { ok: false, error: "Unknown night." };
  let sitterPersonId: string | null = null, name = t(sitterName, 60);
  const m = await matchSitter(name); if (m && m !== "ambiguous") { sitterPersonId = m.id; name = m.name; }
  const due = new Date(n.leave_at) <= new Date();
  const { error } = await c.sb.from("sitter_nights").update({ sitter_name: name, sitter_person_id: sitterPersonId, status: n.status === "needed" ? (due ? "awaiting_review" : "scheduled") : n.status, prompted_at: n.status === "needed" && due ? new Date().toISOString() : undefined }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await nightLog(c, "sitter_booked", name ?? "sitter", id);
  await applyDefaults(c, id);
  return { ok: true, id, review: due };
}

// The open nights, nearest first: needed, scheduled, awaiting review, confirmed.
export async function openNights(c: NightCtx) {
  const { data } = await c.sb.from("sitter_nights").select("id, title, status, sitter_name, sitter_person_id, event_key, starts_at, leave_at, ends_at, place").in("status", ["needed", "proposed", "scheduled", "awaiting_review", "confirmed"]).gt("ends_at", new Date().toISOString()).order("starts_at").limit(10);
  return data ?? [];
}
