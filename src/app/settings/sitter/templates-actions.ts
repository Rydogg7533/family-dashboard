"use server";
// Settings › Sitter: templates (general and per child) and approved sitters. Spec: claude/stewardos-sitter-templates-spec-2026-10-27.md; decisions 2026-10-27k D1–D4.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { templateSections, type TemplateKind } from "@/lib/sitter-shared";

type Res = { ok: boolean; error?: string; note?: string; id?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\r\u0000-\u001f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, n);

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
const touch = (id?: string) => { revalidatePath("/settings/sitter"); if (id) { revalidatePath(`/settings/sitter/templates/${id}`); revalidatePath(`/settings/sitter/people/${id}`); } revalidatePath("/"); };
const NOT_IN = { ok: false, error: "Not signed in or not available in preview." };

// ---- Templates ----
export async function createSitterTemplate(kind: TemplateKind, name: string, childId?: string | null, copyFrom?: string | null): Promise<Res> {
  const w = await who(); if (!w) return NOT_IN;
  if (kind !== "general" && kind !== "child") return { ok: false, error: "Unknown kind." };
  const nm = clean(name, 60); if (!nm) return { ok: false, error: "Give the template a name, like “Evening out” or “School night”." };
  if (kind === "child" && !(childId && UUID.test(childId))) return { ok: false, error: "Pick which child this is for." };
  const { count } = await w.sb.from("sitter_templates").select("id", { count: "exact", head: true }).eq("kind", kind).is("archived_at", null);
  const { data, error } = await w.sb.from("sitter_templates").insert({ kind, child_id: kind === "child" ? childId : null, name: nm, is_default: (count ?? 0) === 0, sort: count ?? 0, created_by: w.user.id }).select("id").single();
  if (error) return { ok: false, error: /unique/i.test(error.message) ? "A template with that name already exists." : error.message };
  if (copyFrom && UUID.test(copyFrom)) {
    const { data: src } = await w.sb.from("sitter_template_items").select("section, text, thing_item_id, sort, default_on, sensitivity").eq("template_id", copyFrom).is("archived_at", null);
    if (src?.length) await w.sb.from("sitter_template_items").insert(src.map((s) => ({ ...s, template_id: data.id, created_by: w.user.id })));
  }
  await log(w, "sitter_template_added", `${w.name}: ${nm}`); touch();
  return { ok: true, id: data.id };
}

export async function renameSitterTemplate(id: string, name: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown template." };
  const w = await who(); if (!w) return NOT_IN;
  const nm = clean(name, 60); if (!nm) return { ok: false, error: "Give it a name." };
  const { error } = await w.sb.from("sitter_templates").update({ name: nm }).eq("id", id);
  if (error) return { ok: false, error: /unique/i.test(error.message) ? "A template with that name already exists." : error.message };
  await log(w, "sitter_template_renamed", nm); touch(id);
  return { ok: true };
}

export async function setDefaultSitterTemplate(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown template." };
  const w = await who(); if (!w) return NOT_IN;
  const { data: t } = await w.sb.from("sitter_templates").select("kind, child_id, name").eq("id", id).maybeSingle(); if (!t) return { ok: false, error: "Unknown template." };
  let q = w.sb.from("sitter_templates").update({ is_default: false }).eq("kind", t.kind).is("archived_at", null).eq("is_default", true);
  q = t.child_id ? q.eq("child_id", t.child_id) : q.is("child_id", null);
  await q;
  const { error } = await w.sb.from("sitter_templates").update({ is_default: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_template_default", t.name); touch(id);
  return { ok: true };
}

// Hidden, never deleted. A default cannot be archived while another template of its kind exists; pick a new default first.
export async function archiveSitterTemplate(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown template." };
  const w = await who(); if (!w) return NOT_IN;
  const { data: t } = await w.sb.from("sitter_templates").select("kind, child_id, name, is_default").eq("id", id).maybeSingle(); if (!t) return { ok: false, error: "Unknown template." };
  if (t.is_default) {
    let q = w.sb.from("sitter_templates").select("id", { count: "exact", head: true }).eq("kind", t.kind).is("archived_at", null).neq("id", id);
    q = t.child_id ? q.eq("child_id", t.child_id) : q.is("child_id", null);
    const { count } = await q;
    if (count) return { ok: false, error: "This is the default. Make another one the default first." };
  }
  const { error } = await w.sb.from("sitter_templates").update({ archived_at: new Date().toISOString(), is_default: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_template_hidden", t.name); touch(id);
  return { ok: true };
}

// ---- Template lines ----
export async function addTemplateLine(templateId: string, section: string, text: string, thingItemId?: string | null, defaultOn?: boolean): Promise<Res> {
  if (!UUID.test(templateId)) return { ok: false, error: "Unknown template." };
  const w = await who(); if (!w) return NOT_IN;
  const { data: t } = await w.sb.from("sitter_templates").select("kind").eq("id", templateId).is("archived_at", null).maybeSingle(); if (!t) return { ok: false, error: "Unknown template." };
  const def = templateSections(t.kind as TemplateKind).find((s) => s.id === section); if (!def) return { ok: false, error: "Unknown section." };
  const tx = clean(text, 400); if (!tx) return { ok: false, error: "Write what the sitter should see." };
  const { count } = await w.sb.from("sitter_template_items").select("id", { count: "exact", head: true }).eq("template_id", templateId).eq("section", section).is("archived_at", null);
  const { error } = await w.sb.from("sitter_template_items").insert({ template_id: templateId, section, text: tx, thing_item_id: thingItemId && UUID.test(thingItemId) ? thingItemId : null, default_on: def.health ? false : defaultOn !== false, sensitivity: def.health ? "health" : "normal", sort: (count ?? 0) + 1, created_by: w.user.id });
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_line_added", section); touch(templateId);
  return { ok: true };
}

export async function updateTemplateLine(id: string, text: string, defaultOn: boolean): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown line." };
  const w = await who(); if (!w) return NOT_IN;
  const tx = clean(text, 400); if (!tx) return { ok: false, error: "Write what the sitter should see." };
  const { data: cur } = await w.sb.from("sitter_template_items").select("template_id, sensitivity").eq("id", id).maybeSingle();
  const { error } = await w.sb.from("sitter_template_items").update({ text: tx, default_on: cur?.sensitivity === "health" ? false : defaultOn }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_line_edited", "line"); touch(cur?.template_id);
  return { ok: true };
}

export async function archiveTemplateLine(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown line." };
  const w = await who(); if (!w) return NOT_IN;
  const { data: cur } = await w.sb.from("sitter_template_items").select("template_id").eq("id", id).maybeSingle();
  const { error } = await w.sb.from("sitter_template_items").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, "sitter_line_hidden", "line"); touch(cur?.template_id);
  return { ok: true };
}

// ---- Approved sitters ----
export type SitterFields = { relationship?: string; ageBand?: "adult" | "teen" | ""; age?: number | null; rateText?: string; drives?: boolean | null; childrenOk?: string[] | null; availabilityText?: string; guardianContactId?: string | null; certifiedText?: string; notes?: string };
const fieldsToRow = (f: SitterFields) => {
  const row: Record<string, unknown> = {};
  if ("relationship" in f) row.relationship = clean(f.relationship, 120) || null;
  if ("ageBand" in f) row.age_band = f.ageBand === "adult" || f.ageBand === "teen" ? f.ageBand : null;
  if ("age" in f) row.age = f.age != null && Number.isFinite(Number(f.age)) && Number(f.age) >= 10 && Number(f.age) <= 120 ? Math.round(Number(f.age)) : null;
  if ("rateText" in f) row.rate_text = clean(f.rateText, 60) || null;
  if ("drives" in f) row.drives = typeof f.drives === "boolean" ? f.drives : null;
  if ("childrenOk" in f) row.children_ok = Array.isArray(f.childrenOk) ? f.childrenOk.filter((x) => UUID.test(x)) : null;
  if ("availabilityText" in f) row.availability_text = clean(f.availabilityText, 200) || null;
  if ("guardianContactId" in f) row.guardian_contact_id = f.guardianContactId && UUID.test(f.guardianContactId) ? f.guardianContactId : null;
  if ("certifiedText" in f) row.certified_text = clean(f.certifiedText, 120) || null;
  if ("notes" in f) row.notes = String(f.notes ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, 2000) || null;
  return row;
};

export async function searchContactsForSitter(q: string): Promise<{ id: string; name: string; phone: string | null; mine: boolean }[]> {
  const w = await who(); if (!w) return [];
  const term = clean(q, 40).replace(/[%,()]/g, " ").trim(); if (term.length < 2) return [];
  const { data } = await w.sb.from("contact_cards").select("id, person, full_name, first_name, last_name, phones").is("deleted_at", null).or(`full_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`).order("full_name").limit(12);
  return (data ?? []).map((c) => { const p = (c.phones ?? []) as { label?: string; number?: string }[]; const m = p.find((x) => /mobile|cell|iphone/i.test(x.label ?? "")) ?? p[0]; return { id: c.id, name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed", phone: m?.number ?? null, mine: c.person === w.user.id }; });
}

// The "finish later" task (D4): one per sitter, assigned to whoever added them, due in 7 days, pointing at the sitter's page.
async function finishLaterTask(w: W, sitterId: string, name: string, missing: string[]) {
  const due = new Date(Date.now() + 7 * 864e5); due.setHours(17, 0, 0, 0);
  const { data } = await w.sb.from("tasks").insert({ person: w.user.id, audience: "one", fyi: [], kind: "do", title: `Finish ${name}'s sitter details`, summary: `Still missing: ${missing.join(", ")}. Settings › Sitter › Approved sitters › ${name}.`, origin_kind: "sitter_person", origin_ref: sitterId, due_at: due.toISOString(), tier: 1, status: "open" }).select("id").single();
  if (data?.id) await w.sb.from("sitter_people").update({ finish_task_id: data.id }).eq("id", sitterId);
}

// Add from an existing card. Members can add; only an owner's add is an approval (the database turns a member's into a suggestion).
export async function addSitterFromContact(cardId: string, fields: SitterFields, finishLater: boolean): Promise<Res> {
  if (!UUID.test(cardId)) return { ok: false, error: "Pick a contact." };
  const w = await who(); if (!w) return NOT_IN;
  const { data: card } = await w.sb.from("contact_cards").select("id, person, full_name, first_name, last_name, phones, shared").eq("id", cardId).is("deleted_at", null).maybeSingle();
  if (!card) return { ok: false, error: "That contact is not in your address book." };
  const name = card.full_name || [card.first_name, card.last_name].filter(Boolean).join(" ") || "This contact";
  const { data: dup } = await w.sb.from("sitter_people").select("id").eq("contact_id", cardId).is("archived_at", null).maybeSingle();
  if (dup) return { ok: false, error: `${name} is already on the sitter list.` };
  const row = { contact_id: cardId, ...fieldsToRow(fields), approved_at: new Date().toISOString(), suggested_by: w.owner ? null : w.user.id };
  const { data, error } = await w.sb.from("sitter_people").insert(row).select("id, approved_at, relationship, age_band, rate_text, drives, availability_text, notes").single();
  if (error) return { ok: false, error: error.message };
  if (card.person === w.user.id && !card.shared) await w.sb.from("contact_cards").update({ shared: true }).eq("id", cardId);
  const missing = missingOf(data, !!((card.phones ?? []) as unknown[]).length);
  if (finishLater && missing.length) await finishLaterTask(w, data.id, name, missing);
  await log(w, data.approved_at ? "sitter_approved" : "sitter_suggested", `${w.name}: ${name}`); touch();
  return { ok: true, id: data.id, note: data.approved_at ? `${name} is on your sitter list.` : `Suggested. An owner can approve ${name} under Settings › Sitter.` };
}

// Add someone new: the contact goes into the sync queue (written to Google or iCloud by the Mac mini), the sitter row points at that edit until the card exists.
export async function addSitterNew(firstName: string, lastName: string, phone: string, fields: SitterFields, finishLater: boolean): Promise<Res> {
  const w = await who(); if (!w) return NOT_IN;
  const first = clean(firstName, 80), last = clean(lastName, 80), num = clean(phone, 40);
  if (!first && !last) return { ok: false, error: "What's their name?" };
  if (!num) return { ok: false, error: "A mobile number is needed so the sheet can show it." };
  if (!/^[+(\d][\d\s().\-+x#*]*$/i.test(num) || num.replace(/\D/g, "").length < 7) return { ok: false, error: `“${num}” doesn't look like a phone number.` };
  const { data: conn } = await w.sb.from("person_connections").select("provider").eq("person", w.user.id).eq("kind", "contacts").maybeSingle();
  const chosen = conn?.provider ?? "none";
  if (chosen === "none") return { ok: false, error: "Your contacts are not connected, so a new person can't be added yet. Choose Apple or Google under Settings › Contacts source, or pick someone already in Contacts." };
  const name = [first, last].filter(Boolean).join(" ");
  const summary = `new contact ${name} (sitter)`;
  const { data: edit, error: e1 } = await w.sb.from("contact_edits").insert({ person: w.user.id, requested_by: w.user.id, provider: chosen, op: "create", fields: { first_name: first, last_name: last, org: "", phones: [{ label: "mobile", number: num }], emails: [] }, summary }).select("id").single();
  if (e1 || !edit) return { ok: false, error: "Could not queue the contact. Try again." };
  const row = { pending_edit_id: edit.id, ...fieldsToRow(fields), approved_at: new Date().toISOString(), suggested_by: w.owner ? null : w.user.id };
  const { data, error } = await w.sb.from("sitter_people").insert(row).select("id, approved_at, relationship, age_band, rate_text, drives, availability_text, notes").single();
  if (error) return { ok: false, error: error.message };
  const missing = missingOf(data, true);
  if (finishLater && missing.length) await finishLaterTask(w, data.id, name, missing);
  await log(w, "contact_create_requested", `${w.name} added ${summary}`);
  await log(w, data.approved_at ? "sitter_approved" : "sitter_suggested", `${w.name}: ${name}`); touch();
  return { ok: true, id: data.id, note: `${name} is on your sitter list. The contact is written to your ${chosen === "google" ? "Google" : "Apple"} contacts on the next sync (within about 30 minutes).` };
}

const missingOf = (r: { relationship: string | null; age_band: string | null; rate_text: string | null; drives: boolean | null; availability_text: string | null; notes: string | null }, hasPhone: boolean) => {
  const m: string[] = []; if (!hasPhone) m.push("phone");
  if (!r.relationship) m.push("how you know them"); if (!r.age_band) m.push("adult or teen"); if (!r.rate_text) m.push("rate"); if (r.drives == null) m.push("drives"); if (!r.availability_text) m.push("availability"); if (!r.notes) m.push("notes");
  return m;
};

export async function updateSitter(id: string, fields: SitterFields): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown sitter." };
  const w = await who(); if (!w) return NOT_IN;
  const row = fieldsToRow(fields); if (!Object.keys(row).length) return { ok: false, error: "Nothing to change." };
  const { data, error } = await w.sb.from("sitter_people").update(row).eq("id", id).select("id, finish_task_id, relationship, age_band, rate_text, drives, availability_text, notes").single();
  if (error) return { ok: false, error: error.message };
  // Filling the fields completes the finish-later task.
  if (data.finish_task_id && missingOf(data, true).length === 0) await w.sb.from("tasks").update({ status: "done", done_by: w.name, updated_at: new Date().toISOString() }).eq("id", data.finish_task_id).eq("status", "open");
  await log(w, "sitter_edited", Object.keys(row).join(", ")); touch(id);
  return { ok: true };
}

export async function approveSitter(id: string, approve: boolean): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown sitter." };
  const w = await who(); if (!w) return NOT_IN;
  if (!w.owner) return { ok: false, error: "Only an owner can approve a sitter." };
  const { error } = await w.sb.from("sitter_people").update(approve ? { approved_at: new Date().toISOString(), approved_by: w.user.id } : { approved_at: null, approved_by: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(w, approve ? "sitter_approved" : "sitter_unapproved", w.name); touch(id);
  return { ok: true };
}

// Retire: the approval is archived; the contact itself stays in Contacts.
export async function archiveSitter(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown sitter." };
  const w = await who(); if (!w) return NOT_IN;
  const { data, error } = await w.sb.from("sitter_people").update({ archived_at: new Date().toISOString() }).eq("id", id).select("finish_task_id").single();
  if (error) return { ok: false, error: error.message };
  if (data?.finish_task_id) await w.sb.from("tasks").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", data.finish_task_id).eq("status", "open");
  await log(w, "sitter_retired", w.name); touch(id);
  return { ok: true };
}

export async function restoreSitter(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown sitter." };
  const w = await who(); if (!w) return NOT_IN;
  const { error } = await w.sb.from("sitter_people").update({ archived_at: null }).eq("id", id);
  if (error) return { ok: false, error: /unique/i.test(error.message) ? "That contact is already on the list." : error.message };
  await log(w, "sitter_restored", w.name); touch(id);
  return { ok: true };
}

export async function makeFinishTask(id: string): Promise<Res> {
  if (!UUID.test(id)) return { ok: false, error: "Unknown sitter." };
  const w = await who(); if (!w) return NOT_IN;
  const { data } = await w.sb.from("sitter_people").select("id, contact_id, pending_edit_id, finish_task_id, relationship, age_band, rate_text, drives, availability_text, notes").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "Unknown sitter." };
  if (data.finish_task_id) { const { data: t } = await w.sb.from("tasks").select("status").eq("id", data.finish_task_id).maybeSingle(); if (t?.status === "open") return { ok: false, error: "There is already an open task for this." }; }
  const missing = missingOf(data, true); if (!missing.length) return { ok: false, error: "Nothing is missing." };
  let name = "the sitter";
  if (data.contact_id) { const { data: c } = await w.sb.from("contact_cards").select("full_name, first_name, last_name").eq("id", data.contact_id).maybeSingle(); name = c?.full_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || name; }
  await finishLaterTask(w, id, name, missing); touch(id);
  return { ok: true, note: "Task added." };
}
