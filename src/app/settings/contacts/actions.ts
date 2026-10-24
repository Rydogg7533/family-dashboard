"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { checkChoice } from "@/lib/contacts-providers";

// Saves where the signed-in person's contacts live (migration 0029). Everything is the person's own row (row-level security).
// Switching never deletes a contact: the old source's cards are hidden (deleted_at) and come back at the next sync if the
// person switches back. The Mac mini jobs for the chosen source pick the person up within minutes and report status here.
export async function setContactsProvider(input: { provider: string; account: string }) {
  const provider = String(input?.provider ?? ""), account = String(input?.account ?? "").trim().toLowerCase().slice(0, 200);
  const bad = checkChoice(provider, account);
  if (bad) return { ok: false as const, error: bad };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in again." };
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = prof?.display_name ?? user.email ?? "member";

  const { data: cur } = await sb.from("person_connections").select("provider,account").eq("person", user.id).eq("kind", "contacts").maybeSingle();
  const acct = provider === "none" ? null : account || null;
  if (cur && cur.provider === provider && (cur.account ?? null) === acct) return { ok: true as const, unchanged: true };

  const now = new Date().toISOString();
  const waiting = provider === "none" ? "ok" : "waiting";
  // Insert the first time, update after that. (An upsert would also rewrite person and kind, which the app may not change.)
  const { error } = cur
    ? await sb.from("person_connections").update({ provider, account: acct, status: waiting, status_note: null, changed_by: user.id, updated_at: now }).eq("person", user.id).eq("kind", "contacts")
    : await sb.from("person_connections").insert({ person: user.id, kind: "contacts", provider, account: acct, status: waiting, status_note: null, changed_by: user.id, updated_at: now });
  if (error) { console.error("setContactsProvider:", error.code, error.message); return { ok: false as const, error: "Could not save. Try again." }; }

  // Hide (never delete) cards that belong to a source this person no longer uses.
  if (provider === "none") await sb.from("contact_cards").update({ deleted_at: now }).eq("person", user.id).is("deleted_at", null);
  else await sb.from("contact_cards").update({ deleted_at: now }).eq("person", user.id).neq("provider", provider).is("deleted_at", null);

  await sb.from("activity_log").insert({ actor: who, action: "contacts_source_changed", subject: `${who} set contacts to ${provider === "google" ? "Google Contacts" : provider === "icloud" ? "Apple (iCloud) Contacts" : "not connected"}`, undoable: false }).then(() => {}, () => {});
  return { ok: true as const };
}
