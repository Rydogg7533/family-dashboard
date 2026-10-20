"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { fileCapture } from "@/app/inbox/file";
import { readCapture } from "@/app/inbox/read";
import { FILE_YES, FILE_CLAIM, FILE_NO } from "@/lib/inbox-answers";

// Resolving an Inbox item: the answer is recorded, the item is filed, and (where it can) a rule is proposed.
export async function resolveInboxItem(id: string, answer: string, makeRule: boolean): Promise<{ ok: boolean; sample?: boolean; summary?: string; kept?: boolean }> {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  // A stored, already-read document is filed by the filing step whatever the answer's wording; free text is kept as the note.
  let { data: row } = await sb.from("inbox_items").select("file_path,read_result,status").eq("id", id).maybeSingle();
  // A filing answer on a stored file that has not finished being read: read it first, then file it, so a fast tap is never lost.
  if (row?.status === "open" && row.file_path && !row.read_result && [FILE_YES, FILE_CLAIM, FILE_NO].includes(answer)) {
    await readCapture(id).catch(() => null);
    row = (await sb.from("inbox_items").select("file_path,read_result,status").eq("id", id).maybeSingle()).data;
  }
  if (row?.status === "open" && row.file_path && row.read_result && Object.keys(row.read_result as object).length && !(row.read_result as { error?: string }).error) {
    const r = await fileCapture(id, answer);
    return { ok: r.ok, summary: r.summary, kept: r.kept };
  }
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
export async function recordCapture(kind: "photo" | "file" | "bulk", files: CapturedFile[], claimId: string | null = null) {
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
      file_path: f.path, mime: f.mime, size_bytes: f.size, sha256: f.sha256, claim_id: claimId,
    };
  });
  const { data: inserted, error } = await sb.from("inbox_items").insert(rows).select("id,file_path");
  const ids = (inserted ?? []).filter((r) => r.file_path).map((r) => r.id as string);
  return { ok: !error, ids, created: rows.length, stored: files.filter((f) => f.path).length, duplicates, failed: files.filter((f) => !f.path).map((f) => f.name) };
}

// Another page of the same document: appended to the item, which is then read again as a whole.
export async function addPage(inboxId: string, page: { path: string; mime: string; size: number; sha256: string | null }) {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: row } = await sb.from("inbox_items").select("file_path,mime,size_bytes,sha256,pages,status").eq("id", inboxId).maybeSingle();
  if (!row?.file_path || row.status !== "open") return { ok: false };
  const pages = (row.pages as unknown[] | null) ?? [{ path: row.file_path, mime: row.mime, size: row.size_bytes, sha256: row.sha256 }];
  const { error } = await sb.from("inbox_items").update({
    pages: [...pages, page], read_at: null, read_result: null, suggested_name: null,
    missing: "Reading all pages…", options: ["Receipt", "Bill", "Statement", "Form", "Something else"],
  }).eq("id", inboxId);
  return { ok: !error, pages: pages.length + 1 };
}
