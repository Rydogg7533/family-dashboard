"use server";
// Fixing a receipt after it was answered. Changes only what the app itself holds: the record of what was read, the name, and the receipt's vendor, amount and date.
// Refuses (and says why) when something outside the app holds the old wording. Nothing is deleted; the reader's first value is kept beside each correction.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { checkCorrection, noteCorrection, rebuildName, type Corrections, type EditableField } from "@/lib/read-correction";
import { amendBlock, fieldBlock } from "@/lib/amend-rules";

export async function amendDecided(inboxId: string, field: string, raw: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Not available in preview." };
  const chk = checkCorrection(field, raw);
  if (!chk.ok) return { ok: false, error: chk.error };
  const f = field as EditableField;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { data: row } = await sb.from("inbox_items").select("id,status,read_result,filed,copied_path").eq("id", inboxId).maybeSingle();
  if (!row) return { ok: false, error: "That item is gone." };
  if (row.status !== "resolved") return { ok: false, error: "This one is still open; use the pencils on its card." };
  const rr = row.read_result as Record<string, unknown> | null;
  if (!rr || "error" in rr) return { ok: false, error: "There is nothing to fix on this one." };
  const filed = (row.filed ?? {}) as Record<string, unknown>;
  const rid = filed.receipt_id as string | undefined;
  const { data: rc } = rid ? await sb.from("receipts").select("id,transaction_id,documents,merchant,amount,date").eq("id", rid).maybeSingle() : { data: null };
  const ctx = { copied_path: row.copied_path as string | null, filed, kind: rr.kind as string | undefined, transaction_id: (rc?.transaction_id as string | null) ?? null };
  const why = amendBlock(ctx) ?? fieldBlock(f, ctx);
  if (why) return { ok: false, error: why };
  if (!rc) return { ok: false, error: "The receipt record is missing." };

  const by = (prof?.display_name as string | null) ?? user.email ?? "member";
  const at = new Date().toISOString();
  const next: Record<string, unknown> = { ...rr, [f]: chk.value, corrections: noteCorrection(rr.corrections as Corrections | undefined, f, rr[f], chk.value, by, at), amended_at: at };
  const nm = f === "vendor" || f === "date" || f === "item" ? rebuildName(next) : null;

  // The receipt first (it is what Money shows), then the item. Each is a single guarded update.
  const rpatch: Record<string, unknown> = {};
  if (f === "vendor") rpatch.merchant = chk.value;
  if (f === "amount") rpatch.amount = chk.value;
  if (f === "date") rpatch.date = chk.value;
  if (nm) rpatch.documents = ((rc.documents as Array<Record<string, unknown>> | null) ?? []).map((d) => (d.inbox_id === inboxId ? { ...d, name: nm } : d));
  if (Object.keys(rpatch).length) {
    const { error: e1 } = await sb.from("receipts").update(rpatch).eq("id", rc.id).is("transaction_id", null);
    if (e1) return { ok: false, error: e1.message };
  }
  const ipatch: Record<string, unknown> = { read_result: next };
  if (nm) { ipatch.title = nm; ipatch.suggested_name = nm; }
  const { data: saved, error } = await sb.from("inbox_items").update(ipatch).eq("id", inboxId).eq("status", "resolved").select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!saved) return { ok: false, error: "That item changed while you were editing." };
  await sb.from("activity_log").insert({ actor: user.email ?? by, action: "inbox_amended", subject: `${f}: ${String(rr[f] ?? "(none)")} → ${String(chk.value)}`.slice(0, 80), ref: inboxId, undoable: false }).then(() => {}, () => {});
  revalidatePath("/inbox"); revalidatePath("/money/receipts"); revalidatePath("/money");
  return { ok: true };
}
