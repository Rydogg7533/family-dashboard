"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { VAULT_GROUP_IDS, isVaultLink, kindById, buildLabel, labelKey, type About } from "@/lib/vault";

export type VaultInput = { id?: string; group: string; label: string; item_type?: string; link?: string; expires_on?: string; note?: string; household: boolean;
  // D19: a new pointer is a kind about a subject; the label, group, type and owner follow from those. Edits of old rows may omit them.
  kind?: string; about?: About; subjectId?: string; subjectName?: string };
// "12/18/2033", "2033-12-18" or "Dec 18, 2033" typed anywhere becomes the date field, so a date never hides in a note.
export function dateIn(text: string): string | null {
  const m1 = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text); if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text); if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  const m3 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2}),? (\d{4})\b/i.exec(text);
  if (m3) return `${m3[3]}-${String(["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m3[1].toLowerCase().slice(0, 3)) + 1).padStart(2, "0")}-${m3[2].padStart(2, "0")}`;
  return null;
}
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\r\n\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// Saves a pointer. The link is checked to be a 1Password link, so the Open button never goes anywhere else.
// A household pointer (Shared vault) has person = null; everything else is the saver's own.
export async function saveVaultPointer(input: VaultInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const kind = input.kind ? kindById(input.kind) : null;
  const subject = clean(input.subjectName, 60) || null;
  const label = kind ? buildLabel(kind, kind.about.includes("household") && input.about === "household" ? null : subject) : clean(input.label, 120);
  const group = kind ? kind.group : clean(input.group, 20), link = clean(input.link, 600); let note = clean(input.note, 300);
  if (!label) return { ok: false, error: "Give it a name, the way it is named in 1Password." };
  if (!VAULT_GROUP_IDS.includes(group)) return { ok: false, error: "Pick a group." };
  if (link && !isVaultLink(link)) return { ok: false, error: "That is not a 1Password link. In 1Password: the item's ⋯ menu › Copy Private Link." };
  // A date typed into the note is the date; it is moved, not copied.
  let exp = /^\d{4}-\d{2}-\d{2}$/.test(input.expires_on ?? "") ? (input.expires_on as string) : null;
  if (!exp && note) { const d = dateIn(note); if (d) { exp = d; note = note.replace(/\b(expires?|renews?|exp\.?|valid (?:until|through))\s*:?\s*/i, "").replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}\b/i, "").replace(/\s+/g, " ").trim(); } }
  if (kind?.expires && link && !exp) return { ok: false, error: `A ${kind.label} has a date it expires or renews; add it, so the reminder works.` };
  if (!hasSupabaseEnv()) return { ok: true, id: "sample" };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const about: About | undefined = input.about;
  const person = about ? (about === "me" || about === "account" || about === "entity" ? user.id : null) : (input.household ? null : user.id);
  const attached = about === "vehicle" || about === "device" || about === "child" || about === "account" ? { attached_kind: about, attached_id: clean(input.subjectId, 40) || null } : {};
  const row = { person, group, label, item_type: kind ? kind.type : clean(input.item_type, 30) || null, link: link || null, expires_on: exp, note: note || null, updated_at: new Date().toISOString(), ...attached };
  // Never two pointers for one thing: the same name already on the list means "tap that one and add the link".
  if (!input.id) {
    const { data: live } = await sb.from("vault_pointers").select("id, label, link").is("deleted_at", null);
    const dup = (live ?? []).find((r) => labelKey(String(r.label)) === labelKey(label));
    if (dup) return { ok: false, error: `${dup.label} is already on the list${dup.link ? "" : " without a link"}. Tap it there and ${dup.link ? "edit it" : "add the link"} instead of adding a second one.`, id: dup.id as string };
  }
  if (input.id) {
    const { data, error } = await sb.from("vault_pointers").update(row).eq("id", input.id).is("deleted_at", null).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "That pointer is not yours to change." };
    revalidatePath("/settings/vault");
    return { ok: true, id: data.id as string };
  }
  const { data, error } = await sb.from("vault_pointers").insert({ ...row, created_by: user.id }).select("id").single();
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "vault_pointer_added", subject: `${group}: ${label}`, ref: data.id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/settings/vault");
  return { ok: true, id: data.id as string };
}

// Hidden, never deleted.
export async function removeVaultPointer(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data, error } = await sb.from("vault_pointers").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not yours to remove." };
  revalidatePath("/settings/vault");
  return { ok: true };
}

// Retire or restore a family member's section. Nothing is deleted: the pointers stay, the section just moves
// to "Retired". Owner-only (the table's policy enforces it too). You cannot retire yourself.
export async function setVaultOwnerRetired(ownerKey: string, retired: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!/^(a|k):[0-9a-f-]{36}$/i.test(ownerKey)) return { ok: false, error: "Not a family member." };
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (retired && ownerKey === `a:${user.id}`) return { ok: false, error: "You cannot retire yourself." };
  const now = new Date().toISOString();
  const { error } = await sb.from("vault_retired_owners").upsert({ owner_key: ownerKey, retired_at: retired ? now : null, retired_by: user.id, updated_at: now }, { onConflict: "owner_key" });
  if (error) return { ok: false, error: /row-level security/i.test(error.message) ? "Only the household owner can retire or restore a member." : error.message };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: retired ? "vault_owner_retired" : "vault_owner_restored", subject: ownerKey, undoable: false }).then(() => {}, () => {});
  revalidatePath("/settings/vault");
  return { ok: true };
}

// Generate the household's checklist from the master template (D116). Reads who and what the household
// has -- adults, children, vehicles, business entities -- expands every template item against it, and adds
// only the pointers that do not already exist (matched by label, case-insensitive, among live rows). Safe
// to tap again after a new baby, a new car or a new business: it adds what is new and nothing else.
export async function generateVaultChecklist(): Promise<{ ok: boolean; added: number; total: number; others?: string[]; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, added: 0, total: 0, error: "Not available in preview." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, added: 0, total: 0, error: "Sign in first." };
  const { VAULT_TEMPLATE, RETIRED_GROUPED_LABELS } = await import("@/lib/vault-template");
  const [{ data: adults0 }, { data: kids0 }, { data: vehicles }, { data: docs }, { data: household }, { data: existing }, { data: retiredRows }, { data: accounts }, { data: devices }, { data: bizRows }] = await Promise.all([
    sb.from("profiles").select("id, display_name, role").neq("role", "child").order("created_at"),
    sb.from("children").select("id, display_name, birth_year, profile_id").is("archived_at", null).order("birth_year"),
    sb.from("vehicles").select("id, short").neq("status", "sold"),
    sb.from("documents").select("subject").like("subject", "Business/%").is("gone_at", null).limit(2000),
    sb.from("household").select("head_id").limit(1).maybeSingle(),
    sb.from("vault_pointers").select("id, label").is("deleted_at", null),
    sb.from("vault_retired_owners").select("owner_key").not("retired_at", "is", null),
    sb.from("accounts").select("id, institution, kind, last4").is("retired_at", null),
    sb.from("devices").select("id, name").in("status", ["in use", "spare", "loaned"]),
    sb.from("vault_pointers").select("label").eq("group", "business").is("deleted_at", null),
  ]);
  // The earlier template made one note for many things ("Health insurance cards"); D19 is one row per thing. Those grouped
  // rows retire (never deleted) so the list shows each thing once.
  const grouped = (existing ?? []).filter((r) => RETIRED_GROUPED_LABELS.includes(labelKey(String(r.label))));
  if (grouped.length) await sb.from("vault_pointers").update({ deleted_at: new Date().toISOString(), note: "Split into one item per thing (D19)" }).in("id", grouped.map((r) => r.id)).then(() => {}, () => {});
  const groupedIds = new Set(grouped.map((r) => r.id));
  // A retired member gets no new items.
  const retired = new Set((retiredRows ?? []).map((r) => String(r.owner_key)));
  const adults = (adults0 ?? []).filter((a) => !retired.has(`a:${a.id}`));
  const kids = (kids0 ?? []).filter((k) => !retired.has(`k:${k.id}`));
  // Match on the label with any parenthetical dropped, so "VINs (Tahoe, Sienna)" counts as "VINs" and a
  // hand-named row is never duplicated by the template's plainer name.
  // "EIN letter — SHVR" (old form) and "SHVR EIN letter" (new) are the same thing.
  const key = (l: string) => { const m = /^(.+?) — (.+)$/.exec(l); return labelKey(m ? `${m[2]} ${m[1]}` : l); };
  const have = new Set((existing ?? []).filter((r) => !groupedIds.has(r.id)).map((r) => key(String(r.label))));
  const year = new Date().getFullYear();
  const head = (household?.head_id as string | null) ?? user.id;
  // Businesses: from filed documents, and from any business row already named "<Name> EIN letter" / "EIN letter — <Name>".
  const named = (bizRows ?? []).map((r) => /^(?:EIN letter|Operating agreement and formation documents) — (.+)$/.exec(String(r.label))?.[1] ?? /^(.+) (?:EIN letter|formation documents)$/.exec(String(r.label))?.[1]).filter((x): x is string => !!x);
  const entities = Array.from(new Set([...(docs ?? []).map((d) => String(d.subject).split("/")[1]), ...named].filter((s) => s && s.trim())));
  const rows: { person: string | null; group: string; label: string; item_type: string; note: string | null; created_by: string; attached_kind?: string; attached_id?: string }[] = [];
  const push = (person: string | null, group: string, label: string, type: string, note: string | null, attach?: { kind: string; id: string }) => {
    if (have.has(key(label))) return;
    have.add(key(label));
    rows.push({ person, group, label, item_type: type, note, created_by: user.id, ...(attach ? { attached_kind: attach.kind, attached_id: attach.id } : {}) });
  };
  for (const t of VAULT_TEMPLATE) {
    const base = t.note ?? null;
    // Another adult's personal items are theirs to create (the database refuses them under this login, and
    // this login cannot see them to know whether they exist), so they are made when that adult taps
    // Generate on their own login. Household items are made here for everyone.
    if (t.for === "adult") { for (const a of adults ?? []) { if (a.id === user.id) push(a.id as string, t.group, t.label.replace("{name}", String(a.display_name ?? "Member")), t.type, base); } }
    else if (t.for === "child") for (const k of kids ?? []) {
      const grown = typeof k.birth_year === "number" && year - k.birth_year >= 18;
      const name = String(k.display_name ?? "Child");
      push(null, t.group, t.label.replace("{name}", name), t.type, grown && t.adultChildNote ? `Shared vault, only if ${name} wants the family to hold a copy (an adult)` : base);
    }
    else if (t.for === "vehicle") for (const v of vehicles ?? []) push(null, t.group, t.label.replace("{name}", String(v.short)), t.type, base, { kind: "vehicle", id: String(v.id) });
    else if (t.for === "entity") for (const e of entities) push(head, t.group, t.label.replace("{name}", e), t.type, base);
    else if (t.for === "account") { if (user.id === head) for (const a of accounts ?? []) push(head, t.group, t.label.replace("{name}", `${a.institution} ${a.kind}${a.last4 ? ` ending ${a.last4}` : ""}`), t.type, base, { kind: "account", id: String(a.id) }); }
    else if (t.for === "device") for (const d of devices ?? []) push(null, t.group, t.label.replace("{name}", String(d.name)), t.type, base, { kind: "device", id: String(d.id) });
    else if (t.for === "head") push(head, t.group, t.label, t.type, base);
    else push(null, t.group, t.label, t.type, base);
  }
  const others = (adults ?? []).filter((a) => a.id !== user.id).map((a) => String(a.display_name ?? "Member"));
  if (rows.length) {
    const { error } = await sb.from("vault_pointers").insert(rows);
    if (error) return { ok: false, added: 0, total: have.size, others, error: error.message };
    await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "vault_checklist_generated", subject: `${rows.length} items added`, undoable: false }).then(() => {}, () => {});
  }
  revalidatePath("/settings/vault");
  return { ok: true, added: rows.length, total: have.size, others };
}
