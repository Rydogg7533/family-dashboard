"use server";
// Filing a read capture, after the person taps. One document, several homes, each linked back:
//   Money › Receipts (waits for its card charge) · the vehicle's service history · the vehicle's warranty list ·
//   optionally a reimbursement claim with a check-back reminder. Nothing here runs without that tap.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

import { FILE_CLAIM, FILE_NO, FILE_SAME, FILE_DIFFERENT } from "@/lib/inbox-answers";
import { recordOutcome, recordFilingOutcome } from "@/lib/ai-outcomes";
import { findSameReceipt, blanksToFill, attachDocument, normalizeVendor } from "@/lib/receipt-match";
import { defaultAssignment } from "@/lib/task-defaults";
import { syncWarrantyTasks } from "@/lib/warranties";
import { matchVehicle, type VRow } from "@/lib/match-vehicle";

type Read = { kind?: string; vendor?: string | null; amount?: number | null; date?: string | null; item?: string | null; category?: string; for_vehicle_hint?: string | null; warranty_relevant?: boolean; warranty_note?: string | null; reimbursement_hint?: boolean; card_last4?: string | null; card_brand?: string | null };
export async function fileCapture(inboxId: string, answer: string): Promise<{ ok: boolean; summary: string; kept?: boolean }> {
  if (!hasSupabaseEnv()) return { ok: true, summary: "Filed (sample mode)." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, summary: "Not signed in." };
  const { data: row } = await sb.from("inbox_items").select("id,title,file_path,pages,read_result,suggested_name,status,claim_id").eq("id", inboxId).maybeSingle();
  if (!row || row.status !== "open") return { ok: false, summary: "That item is no longer open." };

  if (answer === FILE_NO) {
    await sb.from("inbox_items").update({ missing: "What is this? A receipt, a bill, a statement, a form, or something else?", options: ["Receipt", "Bill", "Statement", "Form", "Something else"], read_result: null }).eq("id", inboxId);
    await recordOutcome(sb, { kind: "inbox_item", id: inboxId, feature: "capture-read", outcome: "rejected" });
    return { ok: true, summary: "Okay, tell me what it is.", kept: true };
  }

  const r = (row.read_result ?? {}) as Read;
  const who = user.email ?? "member";
  const name = (row.suggested_name as string | null) || row.title;
  const done: string[] = [];
  const filed: Record<string, unknown> = {};
  const wantClaim = answer === FILE_CLAIM;

  // 1. Money › Receipts, unless the same merchant, amount and date is already there.
  if (r.vendor && typeof r.amount === "number" && r.amount > 0 && r.date) {
    // Exact matches link silently. A near match waits for the person's answer: same purchase, or a different one.
    let same = answer === FILE_DIFFERENT ? null : await findSameReceipt(sb, String(r.vendor), r.amount, String(r.date));
    if (!same && answer === FILE_SAME) {
      const nid = (r as { near_receipt?: { id?: string } }).near_receipt?.id;
      if (nid) same = ((await sb.from("receipts").select("*").eq("id", nid).is("duplicate_of", null).maybeSingle()).data as typeof same) ?? null;
    }
    if (same) {
      // Same purchase already filed: keep that row (first wins), fill only its empty fields, link this document to it.
      const patch = blanksToFill(same, { file_path: row.file_path, captured_by: who });
      if (Object.keys(patch).length) await sb.from("receipts").update(patch).eq("id", same.id);
      await attachDocument(sb, same.id, { inbox_id: inboxId, path: (row.file_path as string | null) ?? null, name: name ?? null, source: "upload" });
      filed.duplicate_of = same.id; filed.receipt_id = same.id; done.push("already in Receipts (this document attached to it, not added twice)");
    }
    else {
      const { data: rc, error } = await sb.from("receipts").insert({ merchant: r.vendor, amount: r.amount, date: r.date, source: "upload", file_path: row.file_path, status: "expecting_charge", entity: null, captured_by: who, uploaded_by: user.id, documents: [{ inbox_id: inboxId, path: row.file_path ?? null, name: name ?? null, source: "upload", added_at: new Date().toISOString() }] }).select("id").single();
      if (!error && rc) { filed.receipt_id = rc.id; done.push("Receipts, waiting for its card charge"); }
    }
  }

  // 1b. The card printed on the receipt is one vote for which card paid (medium confidence; a tap or a statement outranks it).
  if (filed.receipt_id && r.card_last4 && /^\d{4}$/.test(String(r.card_last4))) {
    const rows = await sb.from("receipts").select("card").not("card", "is", null).limit(200);
    const known = ((rows.data ?? []) as { card: string }[]).map((x) => x.card).find((c) => c.replace(/\D/g, "").slice(-4) === r.card_last4);
    await sb.rpc("record_card_vote", { p_receipt: filed.receipt_id as string, p_source: "receipt_text", p_card: known ?? `${r.card_brand && r.card_brand !== "null" ? r.card_brand : "Card"} ${r.card_last4}`, p_conf: "medium" });
  }

  // 2. The vehicle: service history and any warranty the paper states.
  let vehicle: VRow | null = null;
  const { data: vs } = await sb.from("vehicles").select("id,name,short,make,model,year,details");
  if (r.category === "vehicle" || r.warranty_relevant) vehicle = matchVehicle(r.for_vehicle_hint, (vs ?? []) as VRow[]);
  if (vehicle) {
    const d = { ...(vehicle.details ?? {}) } as Record<string, unknown>;
    const log = ((d.serviceLog as Array<Record<string, string>>) ?? []).slice();
    const what = r.item ?? "Service";
    const sameLine = (e: Record<string, string>) => e.date === (r.date ?? "") && (e.what === what || (r.amount != null && Number(e.cost) === Number(r.amount) && normalizeVendor(e.shop) === normalizeVendor(r.vendor)));
    if (!log.some(sameLine)) log.push({ date: r.date ?? "", miles: "", what, shop: r.vendor ?? "", cost: r.amount != null ? String(r.amount) : "", proof: name });
    d.serviceLog = log;
    if (r.warranty_note) {
      const w = ((d.warranties as Array<Record<string, string>>) ?? []).slice();
      if (!w.some((e) => e.proof === name)) w.push({ item: what, provider: r.vendor ?? "", start: r.date ?? "", end: "", miles: "", terms: r.warranty_note.slice(0, 400), proof: name });
      d.warranties = w;
      done.push(`${vehicle.short} warranty list (end date not on the paper; add it in Edit details)`);
    }
    const { error } = await sb.from("vehicles").update({ details: d, updated_by: who, updated_at: new Date().toISOString() }).eq("id", vehicle.id);
    if (!error) { filed.vehicle_id = vehicle.id; done.push(`${vehicle.short} service history`); }
  } else if (r.for_vehicle_hint) done.push(`(could not tell which vehicle "${r.for_vehicle_hint}" is; not added to a service history)`);

  await syncWarrantyTasks(sb, user.id).catch(() => null);

  // 2b. Attach to the claim this upload was added for, or to an open claim for the same vehicle that it predates
  //     (the original purchase behind a warranty claim).
  let claimId: string | null = row.claim_id ?? null;
  if (!claimId && vehicle && r.date) {
    const { data: open } = await sb.from("claims").select("id,created_at").eq("vehicle_id", vehicle.id).in("status", ["open", "submitted"]).order("created_at", { ascending: false }).limit(1);
    if (open?.[0] && r.date < String(open[0].created_at).slice(0, 10)) claimId = open[0].id as string;
  }
  if (claimId) {
    const { data: cl } = await sb.from("claims").select("documents,created_at,expected_amount,vendor").eq("id", claimId).maybeSingle();
    if (cl) {
      const older = r.date && r.date < String(cl.created_at).slice(0, 10);
      // A document that carries the claim's own amount and vendor is the current receipt, not the original purchase.
      const cv = normalizeVendor(cl.vendor as string | null), rv = normalizeVendor(r.vendor);
      const sameAmount = cl.expected_amount != null && typeof r.amount === "number" && Math.abs(Number(cl.expected_amount) - r.amount) < 0.01;
      const sameVendor = !cv || !rv || cv.includes(rv) || rv.includes(cv);
      const current = sameAmount && sameVendor;
      const role = current ? "current receipt" : older ? "original purchase" : "supporting document";
      const entry = { role, inbox_id: inboxId, receipt_id: filed.receipt_id ?? null, path: row.file_path, name };
      const prior = ((cl.documents as Array<{ inbox_id?: string }>) ?? []);
      const docs = prior.some((d) => d.inbox_id === inboxId) ? prior.map((d) => (d.inbox_id === inboxId ? entry : d)) : [...prior, entry];
      const { error } = await sb.from("claims").update({ documents: docs, updated_at: new Date().toISOString() }).eq("id", claimId);
      if (!error) { filed.claim_id = claimId; done.push(`added to the claim as ${current ? "the current receipt" : older ? "the original purchase" : "a supporting document"}`); }
    }
  }

  // 3. Reimbursement claim and its reminder.
  if (wantClaim) {
    const checkBy = new Date(Date.now() + 28 * 86400_000).toISOString().slice(0, 10);
    const title = `${r.vendor ?? "Vendor"} reimbursement: ${r.item ?? name}`;
    const { data: claim, error } = await sb.from("claims").insert({
      title, kind: "reimbursement", vendor: r.vendor ?? null, vehicle_id: vehicle?.id ?? null, expected_amount: r.amount ?? null, check_by: checkBy, opened_by: who,
      documents: [{ role: "current receipt", inbox_id: inboxId, receipt_id: filed.receipt_id ?? null, path: row.file_path, name }],
      notes: "Opened from an upload. Add the original purchase receipt if the claim rests on a warranty.",
    }).select("id").single();
    if (!error && claim) {
      filed.claim_id = claim.id;
      const assign = await defaultAssignment(sb, user.id, vehicle?.id ?? null);
      const { data: task } = await sb.from("tasks").insert({ person: assign.person, audience: assign.audience, fyi: assign.fyi, kind: "do", title: `Check for the ${r.vendor ?? "vendor"} reimbursement${r.amount != null ? ` ($${r.amount.toFixed(2)})` : ""}`, summary: `Claim opened ${new Date().toISOString().slice(0, 10)}; they said up to four weeks.`, origin_kind: "claim", origin_ref: claim.id, due_at: new Date(checkBy + "T17:00:00").toISOString(), tier: 2 }).select("id").single();
      if (task) filed.task_id = task.id;
      done.push(`claim opened, reminder set for ${checkBy}`);
    }
  }

  await sb.from("inbox_items").update({ status: "resolved", resolution: answer, resolved_at: new Date().toISOString(), resolved_by: user.id, filed, title: name }).eq("id", inboxId);
  await sb.from("activity_log").insert({ actor: who, action: "capture_filed", subject: `${name}: ${done.join("; ") || "recorded"}`, ref: inboxId, undoable: false }).then(() => {}, () => {});
  await recordFilingOutcome(sb, inboxId);
  revalidatePath("/inbox"); revalidatePath("/vehicles"); revalidatePath("/money/receipts"); revalidatePath("/tasks");
  return { ok: true, summary: done.length ? `Filed: ${done.join("; ")}.` : "Recorded." };
}
