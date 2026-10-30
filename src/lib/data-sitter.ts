import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";
import { missingFields, type SitterPerson, type SitterTemplate, type TemplateLine } from "@/lib/sitter-shared";
import { startsOn, type Night, type NightStatus, type SectionId, type SheetItem, type TemplateItem } from "@/lib/sitter-shared";

type Row = Record<string, unknown>;
export const toNight = (r: Row): Night => ({
  id: r.id as string, eventKey: (r.event_key as string) ?? null, title: r.title as string, place: (r.place as string) ?? null, sitterName: (r.sitter_name as string) ?? null,
  startsAt: r.starts_at as string, leaveAt: r.leave_at as string, endsAt: r.ends_at as string, source: r.source as Night["source"], status: r.status as NightStatus,
  promptTo: (r.prompt_to as string) ?? null, confirmedAt: (r.confirmed_at as string) ?? null, sheet: ((r.sheet as SheetItem[]) ?? []), note: (r.note as string) ?? null, visitOnly: (r.visit_only as string) ?? null,
  sitterPersonId: (r.sitter_person_id as string) ?? null, generalTemplateId: (r.general_template_id as string) ?? null, childTemplates: ((r.child_templates as Record<string, string>) ?? {}), childrenHome: (r.children_home as string[]) ?? null,
  lines: Array.isArray((r.draft as { lines?: unknown })?.lines) ? ((r.draft as { lines: unknown[] }).lines.filter((x): x is string => typeof x === "string")) : [],
  instructionsMode: (r.instructions_mode as Night["instructionsMode"]) ?? null, preparedAt: (r.prepared_at as string) ?? null,
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
    const user = await getRequestUser(); if (!user) return none;
    const sb = await createClient();
    const [{ count: kids }, { data: task }, { data: dis }, states] = await Promise.all([
      sb.from("children").select("id", { count: "exact", head: true }).is("archived_at", null),
      sb.from("guided_tasks").select("completed_at").eq("key", "sitter_sheet").maybeSingle(),
      sb.from("setup_dismissals").select("until").eq("person", user.id).eq("step", "sitter_sheet").gt("until", new Date().toISOString()).maybeSingle(),
      getSections(),
    ]);
    if (!kids || task?.completed_at || dis) return none;
    const { HOUSEHOLD_SECTIONS: SECTIONS } = await import("@/lib/sitter-shared");
    const open = SECTIONS.filter((s) => !(states[s.id] === "done" || states[s.id] === "skipped"));
    return { show: true, done: SECTIONS.length - open.length, total: SECTIONS.length, next: open[0]?.title ?? null };
  } catch { return none; }
}

// ---- Templates and approved sitters (migration 0076/0077) ----

export async function getSitterTemplates(): Promise<SitterTemplate[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const [{ data }, { data: kids }, { data: counts }] = await Promise.all([
    sb.from("sitter_templates").select("id, kind, child_id, name, is_default, sort, updated_at").is("archived_at", null).order("kind").order("sort").order("name"),
    sb.from("children").select("id, display_name").is("archived_at", null),
    sb.from("sitter_template_items").select("template_id").is("archived_at", null),
  ]);
  const kname = new Map((kids ?? []).map((k) => [k.id as string, k.display_name as string]));
  const n = new Map<string, number>(); for (const c of counts ?? []) n.set(c.template_id, (n.get(c.template_id) ?? 0) + 1);
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind, childId: r.child_id, childName: r.child_id ? kname.get(r.child_id) ?? null : null, name: r.name, isDefault: r.is_default, sort: r.sort, itemCount: n.get(r.id) ?? 0, updatedAt: r.updated_at }));
}

export async function getSitterTemplate(id: string): Promise<{ template: SitterTemplate; lines: TemplateLine[] } | null> {
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const all = await getSitterTemplates(); const template = all.find((t) => t.id === id); if (!template) return null;
  const sb = await createClient();
  const { data } = await sb.from("sitter_template_items").select("id, template_id, section, text, thing_item_id, default_on, sensitivity, sort, created_at").eq("template_id", id).is("archived_at", null).order("sort").order("created_at");
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
  const lines = (data ?? []).map((r) => ({ id: r.id, templateId: r.template_id, section: r.section, text: r.text, thingItemId: r.thing_item_id, thingName: r.thing_item_id ? name.get(r.thing_item_id) ?? null : null, photo: r.thing_item_id ? photo.get(r.thing_item_id) ?? null : null, defaultOn: r.default_on, health: r.sensitivity === "health" }));
  return { template, lines };
}

type CardLite = { id: string; person: string; full_name: string | null; first_name: string | null; last_name: string | null; phones: { label?: string; number?: string }[] | null };
const cardName = (c: CardLite) => c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed";
const cardPhone = (c: CardLite) => { const p = c.phones ?? []; const m = p.find((x) => /mobile|cell|iphone/i.test(x.label ?? "")) ?? p[0]; return m?.number ?? null; };

// The list and one person. A sitter added as a new contact shows "pending" until the sync has written the card; then we link it (by the phone in the edit) and share it.
export async function getSitters(includeArchived = false): Promise<SitterPerson[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  let q = sb.from("sitter_people").select("*").order("approved_at", { ascending: false, nullsFirst: true }).order("created_at");
  if (!includeArchived) q = q.is("archived_at", null);
  const { data } = await q; const rows = data ?? [];
  const cardIds = Array.from(new Set(rows.flatMap((r) => [r.contact_id, r.guardian_contact_id]).filter((x): x is string => !!x)));
  const editIds = rows.map((r) => r.pending_edit_id).filter((x): x is string => !!x);
  const [{ data: cards }, { data: edits }, { data: profs }] = await Promise.all([
    cardIds.length ? sb.from("contact_cards").select("id, person, full_name, first_name, last_name, phones").in("id", cardIds) : Promise.resolve({ data: [] as CardLite[] }),
    editIds.length ? sb.from("contact_edits").select("id, person, status, fields, summary, applied_at").in("id", editIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    sb.from("profiles").select("id, display_name"),
  ]);
  const card = new Map((cards ?? []).map((c) => [c.id as string, c as CardLite]));
  const edit = new Map((edits ?? []).map((e) => [e.id as string, e]));
  const pname = new Map((profs ?? []).map((p) => [p.id as string, p.display_name as string]));
  const out: SitterPerson[] = [];
  for (const r of rows) {
    let c = r.contact_id ? card.get(r.contact_id) ?? null : null;
    let name = c ? cardName(c) : "Pending contact", phone = c ? cardPhone(c) : null, pending = !c;
    if (!c && r.pending_edit_id) {
      const e = edit.get(r.pending_edit_id) as { status?: string; fields?: { first_name?: string; last_name?: string; phones?: { number?: string }[] }; person?: string } | undefined;
      if (e?.fields) { name = [e.fields.first_name, e.fields.last_name].filter(Boolean).join(" ") || name; phone = e.fields.phones?.[0]?.number ?? null; }
      // Sync wrote the card: find it by phone digits (or name) in that person's book, link it, share it with the household.
      if (e?.status === "applied" && user && e.person === user.id) {
        const digits = (phone ?? "").replace(/\D/g, "");
        const { data: mine } = await sb.from("contact_cards").select("id, person, full_name, first_name, last_name, phones").eq("person", user.id).is("deleted_at", null).order("synced_at", { ascending: false }).limit(2000);
        const hit = (mine ?? []).find((m) => (digits && ((m.phones ?? []) as { number?: string }[]).some((p) => (p.number ?? "").replace(/\D/g, "").endsWith(digits.slice(-10)))) || (name !== "Pending contact" && cardName(m as CardLite).toLowerCase() === name.toLowerCase()));
        if (hit) {
          await sb.from("sitter_people").update({ contact_id: hit.id }).eq("id", r.id);
          await sb.from("contact_cards").update({ shared: true }).eq("id", hit.id);
          c = hit as CardLite; name = cardName(c); phone = cardPhone(c); pending = false;
        }
      } else if (!e) { name = "Pending contact (added by " + (pname.get(r.suggested_by ?? r.approved_by ?? "") ?? "a parent") + ")"; }
    }
    const g = r.guardian_contact_id ? card.get(r.guardian_contact_id) : null;
    const p: SitterPerson = {
      id: r.id, contactId: c?.id ?? r.contact_id ?? null, pendingEditId: r.pending_edit_id, name, phone, cardMine: !!(c && user && c.person === user.id), pending,
      relationship: r.relationship, ageBand: r.age_band, age: r.age, rateText: r.rate_text, drives: r.drives, childrenOk: r.children_ok, availabilityText: r.availability_text,
      guardianContactId: r.guardian_contact_id, guardianName: g ? cardName(g) : null, certifiedText: r.certified_text, notes: r.notes,
      approvedAt: r.approved_at, suggestedBy: r.suggested_by ? pname.get(r.suggested_by) ?? "a member" : null, lastVisitAt: r.last_visit_at, finishTaskId: r.finish_task_id, missing: [],
    };
    p.missing = missingFields(p);
    out.push(p);
  }
  return out;
}

export async function getSitter(id: string): Promise<SitterPerson | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await getSitters(true)).find((p) => p.id === id) ?? null;
}

// Today, after a visit: the last ended night from the past three days that has not been debriefed ("anything to remember?").
export async function getDebriefNight(): Promise<Night | null> {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data } = await sb.from("sitter_nights").select("*").eq("status", "ended").is("debrief_at", null).gt("ends_at", new Date(Date.now() - 3 * 864e5).toISOString()).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toNight(data) : null;
}
