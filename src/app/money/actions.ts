"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Per-item capture: the browser stores the file in the private captures bucket; this records the proof pointing at it.
export async function attachProof(transactionId: string, kind: "photo" | "digital_receipt" | "statement_line", fileName: string | null, storedPath: string | null = null) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.from("proofs").insert({ transaction_id: transactionId, kind, source_href: storedPath ? `captures:${storedPath}` : fileName ? `drop:${fileName}` : "#", captured_by: user.id });
  if (!error && kind !== "statement_line") await sb.from("receipts").insert({ merchant: "[from capture]", amount: 0, date: new Date().toISOString().slice(0, 10), source: kind === "photo" ? "camera" : "upload", file_path: storedPath ?? fileName, transaction_id: transactionId, status: "matched", uploaded_by: user.id }).then(() => {}, () => {});
  return { ok: !error };
}

// "Explain": a short note resolves the charge without a receipt and proposes a rule when it can.
export async function explainCharge(transactionId: string, note: string, makeRule: boolean) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.from("transactions").update({ status: "classified", note, flag: null }).eq("id", transactionId);
  if (!error) {
    await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "charge_explained", subject: `${transactionId}: ${note.slice(0, 80)}`, ref: transactionId, undoable: true }).then(() => {}, () => {});
    if (makeRule) await sb.from("email_rules").insert({ match_kind: "merchant", match_value: transactionId, action: "classify", target: note.slice(0, 80), proposed_by: user.id, status: "proposed", origin: "Explain on Money" }).then(() => {}, () => {});
  }
  return { ok: !error };
}

export async function answerReceiptQuestion(receiptId: string, answer: string) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { error } = await sb.from("receipts").update({ status: "unmatched", question: null, entity: answer }).eq("id", receiptId);
  return { ok: !error };
}

// Which card a filed receipt was charged to. The filing agent holds the file until this is known (or two weeks pass),
// then files the single copy under Finance/<year>/<card>/<month>/.
export async function setReceiptCard(receiptId: string, card: string) {
  const c = card.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!c) return { ok: false };
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.rpc("record_card_vote", { p_receipt: receiptId, p_source: "you", p_card: c, p_conf: "high" });
  if (!error) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "receipt_card", subject: `${c}`, ref: receiptId, undoable: false }).then(() => {}, () => {});
  return { ok: !error };
}

// Tag a receipt as belonging to something (a vehicle, the house, a person, a trip...). The subject is created the first time it is used.
export async function addReceiptSubject(receiptId: string, kind: string, name: string) {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 60), k = kind.replace(/[^a-z_]/g, "").slice(0, 20) || "other";
  if (!n) return { ok: false };
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  let { data: sub } = await sb.from("subjects").select("id").eq("kind", k).ilike("name", n).maybeSingle();
  if (!sub) { const ins = await sb.from("subjects").insert({ kind: k, name: n, created_by: user.id }).select("id").single(); sub = ins.data; }
  if (!sub) return { ok: false };
  const { error } = await sb.from("receipt_subjects").upsert({ receipt_id: receiptId, subject_id: sub.id, added_by: user.id, removed_at: null }, { onConflict: "receipt_id,subject_id" });
  if (!error) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "receipt_subject", subject: `${k}: ${n}`, ref: receiptId, undoable: false }).then(() => {}, () => {});
  return { ok: !error, id: sub.id as string };
}

// Take a tag off. The link is retired, never deleted.
export async function removeReceiptSubject(receiptId: string, subjectId: string) {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { error } = await sb.from("receipt_subjects").update({ removed_at: new Date().toISOString() }).eq("receipt_id", receiptId).eq("subject_id", subjectId);
  return { ok: !error };
}

// Accounts: every card and bank account owes a statement each month. Owners only; accounts are retired, never deleted.
export type AccountInput = { id?: string; kind: string; institution: string; last4: string; owner: string; entity: string; statement_arrival_day: number | null; statement_delivery: string };
export async function saveAccount(a: AccountInput) {
  const institution = a.institution.trim().slice(0, 40), last4 = a.last4.replace(/\D/g, "").slice(-4);
  if (!institution || last4.length !== 4) return { ok: false, error: "Name and the last four digits are needed." };
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const day = a.statement_arrival_day && a.statement_arrival_day >= 1 && a.statement_arrival_day <= 31 ? Math.round(a.statement_arrival_day) : null;
  const row = { kind: a.kind, institution, last4, owner: a.owner.trim() || "Joint", entity: a.entity.trim() || "Personal", statement_arrival_day: day, statement_delivery: a.statement_delivery, retired_at: null as string | null };
  const id = a.id || `${institution}-${last4}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const { error } = a.id ? await sb.from("accounts").update(row).eq("id", a.id) : await sb.from("accounts").insert({ id, ...row, source: "manual" });
  if (!error) await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "account_saved", subject: `${institution} ••${last4}`, ref: id, undoable: false }).then(() => {}, () => {});
  revalidatePath("/money"); revalidatePath("/money/accounts"); revalidatePath("/money/receipts");
  return { ok: !error, error: error ? (error.code === "23505" ? "That account is already listed." : "Only an owner can change accounts.") : undefined };
}
export async function retireAccount(id: string) {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { error } = await sb.from("accounts").update({ retired_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/money"); revalidatePath("/money/accounts");
  return { ok: !error };
}
