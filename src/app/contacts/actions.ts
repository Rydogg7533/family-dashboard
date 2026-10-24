"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// The app never writes to Apple or Google Contacts and never changes a contact_cards field itself. It queues an edit in
// contact_edits (row-level security: your own address book, status 'pending' only, stamped with the source); the Mac mini
// applies it to iCloud or Google (migration 0029) within a couple of minutes, refuses if iCloud changed first, and backs the card up before touching it (migration 0019).
type Phone = { label: string; number: string };
type Mail = { label: string; address: string };
export type ContactInput = { cardId?: string; baseEtag?: string | null; firstName: string; lastName: string; org: string; phones: Phone[]; emails: Mail[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\r\n\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const norm = (p: Phone[], e: Mail[]) => ({
  phones: (Array.isArray(p) ? p : []).slice(0, 12).map((x) => ({ label: clean(x?.label, 30).toLowerCase() || "other", number: clean(x?.number, 40) })).filter((x) => x.number),
  emails: (Array.isArray(e) ? e : []).slice(0, 12).map((x) => ({ label: clean(x?.label, 30).toLowerCase() || "other", address: clean(x?.address, 200).toLowerCase() })).filter((x) => x.address),
});

export async function saveContact(input: ContactInput) {
  const first = clean(input.firstName, 80), last = clean(input.lastName, 80), org = clean(input.org, 120);
  const { phones, emails } = norm(input.phones, input.emails);
  if (!first && !last && !org) return { ok: false as const, error: "Add a name or a company." };
  for (const p of phones) if (!/^[+(\d][\d\s().\-+x#*]*$/i.test(p.number) || p.number.replace(/\D/g, "").length < 3) return { ok: false as const, error: `“${p.number}” doesn’t look like a phone number.` };
  for (const e of emails) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.address)) return { ok: false as const, error: `“${e.address}” doesn’t look like an email address.` };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in again." };
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = prof?.display_name ?? user.email ?? "member";
  // Which sync applies the edit: a new contact goes to the person's chosen source; an edit goes to the card's own source.
  const { data: conn } = await sb.from("person_connections").select("provider").eq("person", user.id).eq("kind", "contacts").maybeSingle();
  const chosen = conn?.provider ?? "icloud";

  if (!input.cardId) {
    if (chosen === "none") return { ok: false as const, error: "Your contacts are not connected. Choose Apple or Google under Settings › Contacts source." };
    const summary = `new contact ${[first, last].filter(Boolean).join(" ") || org}`;
    const { error } = await sb.from("contact_edits").insert({ person: user.id, requested_by: user.id, provider: chosen, op: "create", fields: { first_name: first, last_name: last, org, phones, emails }, summary });
    if (error) return { ok: false as const, error: "Could not save. Try again." };
    await sb.from("activity_log").insert({ actor: who, action: "contact_create_requested", subject: `${who} added ${summary}`, undoable: false }).then(() => {}, () => {});
    return { ok: true as const };
  }

  if (!UUID.test(input.cardId)) return { ok: false as const, error: "Unknown contact." };
  const { data: card } = await sb.from("contact_cards").select("id,person,etag,provider,first_name,last_name,org,phones,emails,full_name").eq("id", input.cardId).eq("person", user.id).is("deleted_at", null).maybeSingle();
  if (!card) return { ok: false as const, error: "That contact is not in your own address book." };
  const { data: waiting } = await sb.from("contact_edits").select("id").eq("card_id", card.id).eq("status", "pending").limit(1);
  if (waiting?.length) return { ok: false as const, error: "A change to this contact is still being saved. Try again in a couple of minutes." };
  if (input.baseEtag && card.etag && input.baseEtag !== card.etag) return { ok: false as const, error: "This contact just changed. Close it and open it again." };

  // Send only what actually changed, so everything else on the card is left exactly as it is.
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const lab = (l: string) => { const x = String(l || "other").toLowerCase(); return x === "cell" ? "mobile" : x; };
  const fields: Record<string, unknown> = {};
  if ((card.first_name ?? "") !== first) fields.first_name = first;
  if ((card.last_name ?? "") !== last) fields.last_name = last;
  if ((card.org ?? "") !== org) fields.org = org;
  const oldPL = ((card.phones as Phone[]) ?? []).map((p) => `${lab(p.label)}|${p.number}`), newPL = phones.map((p) => `${lab(p.label)}|${p.number}`);
  const oldEL = ((card.emails as Mail[]) ?? []).map((e) => `${lab(e.label)}|${e.address.toLowerCase()}`), newEL = emails.map((e) => `${lab(e.label)}|${e.address}`);
  if (!same(oldPL, newPL)) fields.phones = phones;
  if (!same(oldEL, newEL)) fields.emails = emails;
  if (!Object.keys(fields).length) return { ok: true as const, unchanged: true };

  const summary = `edited ${card.full_name} (${Object.keys(fields).map((k) => k.replace("_name", "").replace("org", "company")).join(", ")})`;
  const { error } = await sb.from("contact_edits").insert({ person: user.id, requested_by: user.id, provider: card.provider, op: "update", card_id: card.id, base_etag: card.etag, fields, summary });
  if (error) return { ok: false as const, error: "Could not save. Try again." };
  await sb.from("activity_log").insert({ actor: who, action: "contact_update_requested", subject: `${who} ${summary}`, ref: card.id, undoable: false }).then(() => {}, () => {});
  return { ok: true as const };
}

// Delete a contact in the person's own Google address book. Queued like every other edit: the Mac mini checks the contact has not
// changed, saves a full copy, deletes it in Google, and hides the card here (deleted_at). Apple contacts cannot be deleted from the app.
export async function deleteContact(cardId: string, baseEtag: string | null) {
  if (!UUID.test(cardId)) return { ok: false as const, error: "Unknown contact." };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in again." };
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = prof?.display_name ?? user.email ?? "member";
  const { data: card } = await sb.from("contact_cards").select("id,etag,provider,full_name").eq("id", cardId).eq("person", user.id).is("deleted_at", null).maybeSingle();
  if (!card) return { ok: false as const, error: "That contact is not in your own address book." };
  if (card.provider !== "google") return { ok: false as const, error: "Contacts can only be deleted here when they live in Google Contacts." };
  const { data: waiting } = await sb.from("contact_edits").select("id").eq("card_id", card.id).eq("status", "pending").limit(1);
  if (waiting?.length) return { ok: false as const, error: "A change to this contact is still being saved. Try again in a couple of minutes." };
  if (baseEtag && card.etag && baseEtag !== card.etag) return { ok: false as const, error: "This contact just changed. Close it and open it again." };
  const summary = `deleted ${card.full_name}`;
  const { error } = await sb.from("contact_edits").insert({ person: user.id, requested_by: user.id, provider: "google", op: "delete", card_id: card.id, base_etag: card.etag, fields: {}, summary });
  if (error) { console.error("deleteContact:", error.code, error.message); return { ok: false as const, error: "Could not delete. Try again." }; }
  await sb.from("activity_log").insert({ actor: who, action: "contact_delete_requested", subject: `${who} ${summary}`, ref: card.id, undoable: false }).then(() => {}, () => {});
  return { ok: true as const };
}
