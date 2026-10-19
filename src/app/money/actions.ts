"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Per-item capture: metadata only; the file lands on the Mac mini and is filed to Finance/<year>/<category>.
export async function attachProof(transactionId: string, kind: "photo" | "digital_receipt" | "statement_line", fileName: string | null) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.from("proofs").insert({ transaction_id: transactionId, kind, source_href: fileName ? `drop:${fileName}` : "#", captured_by: user.id });
  if (!error && kind !== "statement_line") await sb.from("receipts").insert({ merchant: "[from capture]", amount: 0, date: new Date().toISOString().slice(0, 10), source: kind === "photo" ? "camera" : "upload", file_path: fileName, transaction_id: transactionId, status: "matched", uploaded_by: user.id }).then(() => {}, () => {});
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
