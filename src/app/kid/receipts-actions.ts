"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { readCapture } from "@/app/inbox/read";
import { CATEGORY_IDS } from "@/lib/categories";

// Kids keep their receipts (D117). The child photographs a receipt from their page; it is stored and read
// exactly like a parent's capture (same bucket, same reader, same categories), but it is born resolved so it
// never lands in the parents' Inbox as a question. When the reader cannot tell what was bought, the child
// gets one task: "What did you buy at X for $Y?" with a short list of answers. Nothing is deleted; a wrong
// answer is changed by answering again.

export type KidCapture = { name: string; path: string; mime: string; size: number; sha256: string | null };

const SURE = 0.75;

async function me(sb: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: p } = await sb.from("profiles").select("id, display_name, role").eq("id", user.id).maybeSingle();
  return p ? { id: p.id as string, name: String(p.display_name ?? "Kid"), role: String(p.role), email: user.email ?? "" } : null;
}

// Records the capture, reads it, and asks the child what it was when the reader is not sure.
export async function recordKidReceipt(file: KidCapture): Promise<{ ok: boolean; id?: string; asked?: boolean; vendor?: string | null; amount?: number | null; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Not available in preview." };
  const sb = await createClient();
  const who = await me(sb);
  if (!who) return { ok: false, error: "Sign in first." };
  const { data: row, error } = await sb.from("inbox_items").insert({
    kind: "identify", requested_by: who.name, for_person: who.name, title: file.name, origin: "Photo", origin_href: "#", origin_label: "Kid receipt",
    missing: "", options: [], status: "resolved", resolution: "kid_receipt", resolved_at: new Date().toISOString(), resolved_by: who.id,
    file_path: file.path, mime: file.mime, size_bytes: file.size, sha256: file.sha256, created_by: who.id,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  const id = row.id as string;
  const r = await readCapture(id);
  if (!r.ok) {
    // Unreadable: the child still gets asked, so the purchase is recorded in their words.
    await askChild(sb, who, id, null, null);
    return { ok: true, id, asked: true, vendor: null, amount: null };
  }
  const { data: after } = await sb.from("inbox_items").select("read_result").eq("id", id).maybeSingle();
  const rr = (after?.read_result ?? {}) as { vendor?: string; amount?: number; category?: string; confidence?: number; item?: string };
  // The reader's plan (file here, link there) is a parent's concern; a kid's receipt carries only what it says.
  await sb.from("inbox_items").update({ options: [], missing: "" }).eq("id", id);
  const unsure = !rr.category || rr.category === "other" || rr.category === "mixed" || (typeof rr.confidence === "number" && rr.confidence < SURE) || !rr.vendor;
  if (unsure) await askChild(sb, who, id, rr.vendor ?? null, typeof rr.amount === "number" ? rr.amount : null);
  revalidatePath("/kid");
  return { ok: true, id, asked: unsure, vendor: rr.vendor ?? null, amount: typeof rr.amount === "number" ? rr.amount : null };
}

async function askChild(sb: Awaited<ReturnType<typeof createClient>>, who: { id: string; name: string }, itemId: string, vendor: string | null, amount: number | null) {
  const title = vendor && amount != null ? `What did you buy at ${vendor} for $${amount.toFixed(2)}?` : vendor ? `What did you buy at ${vendor}?` : amount != null ? `What was the $${amount.toFixed(2)} receipt for?` : "What was this receipt for?";
  await sb.from("tasks").insert({ person: who.id, audience: "one", fyi: [], kind: "decide", title, summary: "Pick the closest one. A parent sees your answer.", origin_kind: "kid_receipt", origin_ref: itemId, status: "open" });
}

// The child's answer: the category goes on the receipt (as the child's word, beside the reader's), the task closes.
export async function answerKidReceipt(itemId: string, category: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Not available in preview." };
  if (!CATEGORY_IDS.includes(category)) return { ok: false, error: "Pick one of the choices." };
  const sb = await createClient();
  const who = await me(sb);
  if (!who) return { ok: false, error: "Sign in first." };
  const { data: row } = await sb.from("inbox_items").select("read_result").eq("id", itemId).maybeSingle();
  if (!row) return { ok: false, error: "That receipt is not yours." };
  const rr = (row.read_result ?? {}) as Record<string, unknown>;
  const next = { ...rr, category, kid_said: { category, note: (note ?? "").trim().slice(0, 120) || null, by: who.name, at: new Date().toISOString() }, reader_category: rr.reader_category ?? rr.category ?? null };
  const { error } = await sb.from("inbox_items").update({ read_result: next }).eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  await sb.from("tasks").update({ status: "done", done_by: who.name, updated_at: new Date().toISOString() }).eq("origin_kind", "kid_receipt").eq("origin_ref", itemId).eq("status", "open");
  revalidatePath("/kid");
  return { ok: true };
}

export type KidReceiptRow = { id: string; title: string; when: string; vendor: string | null; amount: number | null; category: string | null; item: string | null; asked: boolean; taskTitle: string | null; open: string };

// The child's receipts, newest first, with whether each one still needs their answer. Parents can call it for a child's page.
export async function listKidReceipts(childProfileId?: string): Promise<KidReceiptRow[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const who = await me(sb);
  if (!who) return [];
  const owner = who.role === "child" ? who.id : (childProfileId ?? who.id);
  const [{ data: items }, { data: tasks }] = await Promise.all([
    sb.from("inbox_items").select("id, title, captured_at, read_result").eq("created_by", owner).eq("resolution", "kid_receipt").order("captured_at", { ascending: false }).limit(60),
    sb.from("tasks").select("origin_ref, title").eq("origin_kind", "kid_receipt").eq("status", "open").eq("person", owner),
  ]);
  const asking = new Map((tasks ?? []).map((t) => [String(t.origin_ref), String(t.title)]));
  return (items ?? []).map((i) => {
    const rr = (i.read_result ?? {}) as { vendor?: string; amount?: number; category?: string; item?: string; date?: string };
    return { id: i.id as string, title: String(i.title), when: (rr.date as string | undefined) ?? String(i.captured_at).slice(0, 10), vendor: rr.vendor ?? null, amount: typeof rr.amount === "number" ? rr.amount : null, category: rr.category ?? null, item: rr.item ?? null, asked: asking.has(i.id as string), taskTitle: asking.get(i.id as string) ?? null, open: `/api/capture/${i.id}` };
  });
}
