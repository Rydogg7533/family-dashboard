"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { fileCapture } from "@/app/inbox/file";
import { readCapture } from "@/app/inbox/read";
import { FILE_YES, FILE_CLAIM, FILE_NO } from "@/lib/inbox-answers";
import { filingFolders, vendorKey, toTemplate } from "@/lib/filing-folders";
import { callModel } from "@/lib/ai";

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

// Where a document will be filed can be questioned or changed before the tap. Only folders from the real structure are allowed.
async function folderChoices(sb: Awaited<ReturnType<typeof createClient>>, row: { read_result: Record<string, unknown> | null }) {
  const home = String(row.read_result?.home ?? "");
  const year = home.match(/\/(20\d\d)\//)?.[1] ?? String(new Date().getFullYear());
  const { data: vs } = await sb.from("vehicles").select("short");
  return { home, year, choices: filingFolders(year, (vs ?? []).map((v) => String(v.short)).filter(Boolean)) };
}

export async function getFolderChoices(id: string): Promise<{ ok: boolean; current?: string; choices?: string[] }> {
  if (!hasSupabaseEnv()) return { ok: false };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: row } = await sb.from("inbox_items").select("read_result,status").eq("id", id).maybeSingle();
  if (!row || row.status !== "open" || !row.read_result) return { ok: false };
  const c = await folderChoices(sb, row as { read_result: Record<string, unknown> | null });
  return { ok: true, current: c.home, choices: c.choices };
}

function applyHome(rr: Record<string, unknown>, from: string, to: string) {
  const plan = ((rr.plan as { t: string; text: string }[] | undefined) ?? []).map((p) => (p.t === "file" ? { ...p, text: p.text.replace(from, to) } : p));
  return { ...rr, home: to, plan };
}

// `folder` = a direct pick from the list; `request` = free words ("is this the right place?", "put it under Home").
export async function changeFiling(id: string, input: { folder?: string; request?: string }): Promise<{ ok: boolean; message: string; changed?: boolean }> {
  if (!hasSupabaseEnv()) return { ok: false, message: "Not available in preview." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const { data: row } = await sb.from("inbox_items").select("read_result,status").eq("id", id).maybeSingle();
  if (!row || row.status !== "open" || !row.read_result) return { ok: false, message: "This item is no longer waiting." };
  const rr = row.read_result as Record<string, unknown>;
  const { home, choices } = await folderChoices(sb, { read_result: rr });
  const save = async (to: string, why: string) => {
    await sb.from("inbox_items").update({ read_result: applyHome(rr, home, to) }).eq("id", id);
    await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "filing_folder_changed", subject: `${id}: ${home} → ${to}`, ref: id, undoable: false }).then(() => {}, () => {});
    return { ok: true, changed: true, message: `Changed to ${to.replace("Organized/", "")}. ${why}`.trim() };
  };
  if (input.folder) {
    if (!choices.includes(input.folder)) return { ok: false, message: "That folder is not in the structure." };
    return save(input.folder, "");
  }
  const request = (input.request ?? "").trim().slice(0, 300);
  if (!request) return { ok: false, message: "Say what you want to know or change." };
  const facts = JSON.stringify({ vendor: rr.vendor, item: rr.item, category: rr.category, amount: rr.amount, date: rr.date, kind: rr.kind });
  const r = await callModel({
    job: "file", maxTokens: 400, feature: "filing-folder",
    system: `You help choose the folder for one scanned document in a household filing system. Folders are ONLY from this list (exact strings):\n${choices.join("\n")}\nRules: restaurants and takeout go to Dining; other purchase receipts to Receipts; vehicle repairs and parts to that vehicle's folder; home repairs to Home. Reply with JSON only: {"action":"answer"|"change","folder":<exact string from the list or null>,"reply":<one or two short sentences>}. Use "answer" when the person is asking whether the current folder is right (say yes or no and why); use "change" only when they tell you to move it or you must correct an obvious mistake.`,
    messages: [{ role: "user", content: `Document facts: ${facts}\nCurrent folder: ${home}\nPerson says: ${request}` }],
  });
  let out: { action?: string; folder?: string | null; reply?: string } | null = null;
  try { const m = r.text.match(/\{[\s\S]*\}/); out = m ? JSON.parse(m[0]) : null; } catch { out = null; }
  if (!out) return { ok: false, message: "I could not work that out. Pick a folder from the list instead." };
  if (out.action === "change" && out.folder && choices.includes(out.folder)) return save(out.folder, out.reply ?? "");
  if (out.action === "change") return { ok: false, message: "I could not match that to a folder in the structure. Pick one from the list." };
  return { ok: true, changed: false, message: out.reply ?? "" };
}

// "Always file this vendor here": remembers the current folder for the vendor, so the same question is not asked again.
export async function saveFilingRule(id: string): Promise<{ ok: boolean; message: string }> {
  if (!hasSupabaseEnv()) return { ok: false, message: "Not available in preview." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const { data: row } = await sb.from("inbox_items").select("read_result,status").eq("id", id).maybeSingle();
  const rr = row?.read_result as Record<string, unknown> | null;
  const key = vendorKey(rr?.vendor), home = String(rr?.home ?? "");
  if (!rr || !key || !home) return { ok: false, message: "No vendor on this document, so there is nothing to make a rule for." };
  if (/\/Vehicles\//.test(home)) return { ok: false, message: "Vehicle documents follow the vehicle, so they do not get a vendor rule." };
  const label = String(rr.vendor).replace(/\s*#\s*\d+/g, "").trim() || String(rr.vendor);
  const { error } = await sb.from("filing_rules").upsert({ vendor_key: key, vendor_label: label, folder_template: toTemplate(home), created_by: user.id, source_item: id }, { onConflict: "vendor_key" });
  if (error) return { ok: false, message: "Could not save the rule." };
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "filing_rule_saved", subject: `${label} → ${toTemplate(home)}`, ref: id, undoable: true }).then(() => {}, () => {});
  return { ok: true, message: `Done. ${label} receipts will go to ${toTemplate(home).replace("Organized/", "").replace("{year}", "<year>")}. You can remove this rule in Settings › Filing rules.` };
}
