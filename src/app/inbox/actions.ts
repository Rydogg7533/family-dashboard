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

export type CapturedFile = { name: string; path: string | null; mime: string; size: number; sha256: string | null; failed?: string };

// Each captured file is already stored (private "captures" bucket) by the browser; this records the Inbox row that points at it.
// A file whose content fingerprint matches an earlier capture is flagged as a possible duplicate, never merged silently.
export async function recordCapture(kind: "photo" | "file" | "bulk", files: CapturedFile[]) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true, ids: [] as string[], created: files.length, stored: 0, duplicates: [] as string[], failed: [] as string[] };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, ids: [] as string[], created: 0, stored: 0, duplicates: [] as string[], failed: files.map((f) => f.name) };
  const hashes = files.map((f) => f.sha256).filter((h): h is string => !!h);
  const { data: prior } = hashes.length ? await sb.from("inbox_items").select("sha256,title").in("sha256", hashes) : { data: [] as { sha256: string; title: string }[] };
  const seen = new Map((prior ?? []).map((r) => [r.sha256, r.title]));
  const duplicates: string[] = [];
  const rows = files.map((f) => {
    const dupOf = f.sha256 ? seen.get(f.sha256) : undefined;
    if (dupOf) duplicates.push(f.name);
    const stored = !!f.path;
    return {
      kind: "identify", requested_by: user.email ?? "member", title: f.name,
      origin: kind === "photo" ? "Photo" : kind === "file" ? "Upload" : "Bulk drop", origin_href: "#", origin_label: "Files",
      missing: dupOf ? `This looks identical to "${dupOf}" that was already uploaded. Is it the same document?`
        : stored ? "What is this? A receipt, a bill, a statement, a form, or something else?"
        : "The file did not upload, so only its name is saved. Please upload it again.",
      options: dupOf ? ["Same document (keep one)", "Different, keep both"] : stored ? ["Receipt", "Bill", "Statement", "Form", "Something else"] : ["Upload again"],
      file_path: f.path, mime: f.mime, size_bytes: f.size, sha256: f.sha256,
    };
  });
  const { data: inserted, error } = await sb.from("inbox_items").insert(rows).select("id,file_path");
  const ids = (inserted ?? []).filter((r) => r.file_path).map((r) => r.id as string);
  return { ok: !error, ids, created: rows.length, stored: files.filter((f) => f.path).length, duplicates, failed: files.filter((f) => !f.path).map((f) => f.name) };
}
