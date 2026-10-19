"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { DraftAttachment } from "@/lib/data-email";

// Saves the in-dashboard draft. A mail draft exists only when every attachment is attached, or the person
// chose "Create anyway" (logged). The dashboard never sends.
export async function saveDraft(id: string, text: string, attachments: DraftAttachment[], createAnyway: boolean) {
  const complete = createAnyway || attachments.every((a) => a.status === "attached");
  if (!hasSupabaseEnv()) return { ok: true, sample: true, complete };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, complete };
  const { error } = await sb.from("drafts").update({ text, attachments, complete, create_anyway: createAnyway, updated_at: new Date().toISOString() }).eq("id", id);
  if (!error && createAnyway) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "draft_create_anyway", subject: `Draft ${id} created without every attachment`, ref: id, undoable: false }).then(() => {}, () => {});
  return { ok: !error, complete };
}

// Asks the Mac mini agent to create the draft in the mail app (it polls drafts where complete and
// mail_draft_ref is null). Nothing is sent; "Send" happens in the mail app.
export async function requestMailDraft(id: string) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { error } = await sb.from("drafts").update({ mail_requested_at: new Date().toISOString() }).eq("id", id).eq("complete", true);
  return { ok: !error };
}
