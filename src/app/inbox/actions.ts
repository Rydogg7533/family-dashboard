"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { fileCapture } from "@/app/inbox/file";
import { readCapture } from "@/app/inbox/read";
import { FILE_YES, FILE_CLAIM, FILE_NO } from "@/lib/inbox-answers";
import { SKIP, CLEAR } from "@/lib/paid-with";
import { filingFolders, vendorKey, toTemplate } from "@/lib/filing-folders";
import { callModel, jsonObjectValid } from "@/lib/ai";
import { refreshOpenStatements } from "@/lib/statement-rematch";

// "Paid with" chosen on the card before the Yes tap: stored on the read, applied when the receipt is filed. SKIP = not now.
export async function setInboxPaidWith(id: string, value: string): Promise<{ ok: boolean }> {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: row } = await sb.from("inbox_items").select("read_result,status").eq("id", id).maybeSingle();
  if (!row || row.status !== "open" || !row.read_result || typeof row.read_result !== "object") return { ok: false };
  const v = value.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!v) return { ok: false };
  const next: Record<string, unknown> = { ...(row.read_result as Record<string, unknown>) };
  if (v === CLEAR) delete next.paid_with; else next.paid_with = v === SKIP ? { skipped: true } : { value: v };
  const { error } = await sb.from("inbox_items").update({ read_result: next }).eq("id", id);
  return { ok: !error };
}

// Resolving an Inbox item: the answer is recorded, the item is filed, and (where it can) a rule is proposed.
// `_makeRule` is kept for the client's call shape and ignored. It used to write an email_rules row of kind
// "answer" keyed by THIS item's id -- a rule that could only ever match one already-answered item -- into a
// table nothing reads. The real rule is filing_rules ("Always file this vendor here", read by read.ts the next
// time that vendor's document arrives). Decisions log 2026-10-26h, D99.
export async function resolveInboxItem(id: string, answer: string, _makeRule: boolean): Promise<{ ok: boolean; sample?: boolean; summary?: string; kept?: boolean }> {
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
  }
  return { ok: !error };
}

// "Check against my accounts": the same re-match that runs when an account is saved, on request. Says what it changed; files nothing.
export async function recheckStatements(): Promise<{ ok: boolean; summary: string }> {
  if (!hasSupabaseEnv()) return { ok: true, summary: "Sample mode." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, summary: "Not signed in." };
  const r = await refreshOpenStatements(sb).catch(() => null);
  if (!r) return { ok: false, summary: "Could not check the statements. Nothing was changed." };
  if (r.notice) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "statements_rematched", subject: r.notice.slice(0, 200), ref: null, undoable: false }).then(() => {}, () => {});
  return { ok: true, summary: r.notice ?? "Checked: nothing changed. Every waiting statement already matches your accounts, or still needs one you have not added." };
}

// "File all matched": files every open statement that is already matched to exactly one account (it asks only "File it?").
// Same path as tapping Yes on each one, so each is filed, linked and logged exactly as a single tap would. Unmatched ones are left alone.
export async function fileMatchedStatements(): Promise<{ ok: boolean; filed: number; left: number; summary: string }> {
  if (!hasSupabaseEnv()) return { ok: true, filed: 0, left: 0, summary: "Sample mode." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, filed: 0, left: 0, summary: "Not signed in." };
  const { data: rows } = await sb.from("inbox_items").select("id,options").eq("status", "open").eq("read_result->>kind", "statement").limit(60);
  const ids = ((rows ?? []) as { id: string; options: string[] | null }[]).filter((r) => r.options?.[0] === FILE_YES && r.options.length === 2).map((r) => r.id);
  let filed = 0;
  for (const id of ids) { const r = await fileCapture(id, FILE_YES).catch(() => null); if (r?.ok && !r.kept) filed++; }
  return { ok: true, filed, left: ids.length - filed, summary: `Filed ${filed} statement${filed === 1 ? "" : "s"}${ids.length - filed ? `; ${ids.length - filed} still need a look` : ""}.` };
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
  // Uploaded to a claim: show it on the claim right away (filing later updates this entry, never duplicates it).
  if (claimId && !error && inserted?.length) {
    const { data: cl } = await sb.from("claims").select("documents").eq("id", claimId).maybeSingle();
    if (cl) {
      const docs = [...((cl.documents as unknown[]) ?? []), ...inserted.filter((r) => r.file_path).map((r, i) => ({ role: "supporting document", inbox_id: r.id, path: r.file_path, name: files.filter((f) => f.path)[i]?.name ?? "Upload" }))];
      await sb.from("claims").update({ documents: docs, updated_at: new Date().toISOString() }).eq("id", claimId);
    }
  }
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
    job: "file", maxTokens: 400, feature: "filing-folder", subject: { kind: "inbox_item", id }, promptVersion: "filing-folder-v1", validate: jsonObjectValid,
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

// Hand an Inbox item to one parent (or back to "anyone"). Either parent can still answer it.
export async function assignInboxItem(id: string, to: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (to) { const { data: p } = await sb.from("profiles").select("id").eq("id", to).maybeSingle(); if (!p) return { ok: false, error: "That person is not part of the household." }; }
  const { data, error } = await sb.from("inbox_items").update({ assigned_to: to, assigned_by: to ? user.id : null }).eq("id", id).eq("status", "open").select("id");
  if (error || !data?.length) return { ok: false, error: "Could not hand it over." };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  await sb.from("activity_log").insert({ actor: me?.display_name ?? user.email ?? "member", action: "inbox_assigned", subject: `${id}: ${to ? "handed over" : "back to anyone"}`, ref: id, undoable: false }).then(() => {}, () => {});
  return { ok: true };
}
