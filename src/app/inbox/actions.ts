"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Resolving an Inbox item: the answer is recorded, the item is filed, and (where it can) a rule is proposed.
export async function resolveInboxItem(id: string, answer: string, makeRule: boolean) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.from("inbox_items").update({ status: "resolved", resolution: answer, resolved_at: new Date().toISOString(), resolved_by: user.id }).eq("id", id);
  if (!error) {
    await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "inbox_resolved", subject: `${id}: ${answer}`, ref: id, undoable: true }).then(() => {}, () => {});
    if (makeRule) await sb.from("email_rules").insert({ match_kind: "answer", match_value: id, action: "file", target: answer, proposed_by: user.id, status: "proposed", origin: `Inbox answer ${id}` }).then(() => {}, () => {});
  }
  return { ok: !error };
}

// Capture metadata only (the file itself goes to the Mac mini drop folder / Organized); never contents.
export async function recordCapture(kind: "photo" | "file" | "bulk", names: string[]) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true, created: names.length };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const rows = names.map((n) => ({ kind: "identify", requested_by: user?.email ?? "member", title: n, origin: kind === "photo" ? "Photo" : kind === "file" ? "Upload" : "Bulk drop", origin_href: "#", origin_label: "Files", missing: "What is this? A receipt, a bill, a statement, a form, or something else?", options: ["Receipt", "Bill", "Statement", "Form", "Something else"] }));
  const { error } = await sb.from("inbox_items").insert(rows);
  return { ok: !error, created: rows.length };
}
