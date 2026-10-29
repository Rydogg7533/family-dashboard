"use server";
// Filing a read capture, after the person taps. One document, several homes, each linked back:
//   Money › Receipts (waits for its card charge) · the vehicle's service history · the vehicle's warranty list ·
//   optionally a reimbursement claim with a check-back reminder. Nothing here runs without that tap.
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

import { FILE_CLAIM, FILE_NO, FILE_SAME, FILE_DIFFERENT, NOT_VEHICLE } from "@/lib/inbox-answers";
import { recordOutcome, recordFilingOutcome } from "@/lib/ai-outcomes";
import { findSameReceipt, findOrderReceipt, extractOrderNumber, amountsMatch, blanksToFill, attachDocument, normalizeVendor } from "@/lib/receipt-match";
import { defaultAssignment } from "@/lib/task-defaults";
import { syncWarrantyTasks } from "@/lib/warranties";
import { matchVehicle, vehicleFor, type VRow } from "@/lib/match-vehicle";
import { vehicleLines, lineLabel, type Line } from "@/lib/receipt-lines";
import { matchAccount, accountFromAnswer, statementName, type AccountRow } from "@/lib/statement-match";

type Read = { kind?: string; vendor?: string | null; amount?: number | null; date?: string | null; item?: string | null; category?: string; lines?: Line[]; paid_with?: { value?: string; skipped?: boolean }; for_vehicle_hint?: string | null; vehicle_pick?: string | null; warranty_relevant?: boolean; warranty_note?: string | null; reimbursement_hint?: boolean; card_last4?: string | null; card_brand?: string | null; order_number?: string | null; statement_period?: string | null; closing_date?: string | null; statement_balance?: number | null; due_date?: string | null };
export async function fileCapture(inboxId: string, answer: string): Promise<{ ok: boolean; summary: string; kept?: boolean }> {
  if (!hasSupabaseEnv()) return { ok: true, summary: "Filed (sample mode)." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, summary: "Not signed in." };
  const { data: row } = await sb.from("inbox_items").select("id,title,file_path,pages,read_result,suggested_name,status,claim_id,origin").eq("id", inboxId).maybeSingle();
  if (!row || row.status !== "open") return { ok: false, summary: "That item is no longer open." };

  if (answer === FILE_NO) {
    await sb.from("inbox_items").update({ missing: "What is this? A receipt, a bill, a statement, a form, or something else?", options: ["Receipt", "Bill", "Statement", "Form", "Something else"], read_result: null }).eq("id", inboxId);
    await recordOutcome(sb, { kind: "inbox_item", id: inboxId, feature: "capture-read", outcome: "rejected" });
    return { ok: true, summary: "Okay, tell me what it is.", kept: true };
  }

  const r = (row.read_result ?? {}) as Read;
  // Where this document came from, kept on the receipt. It is the difference between the vendor's own invoice and a
  // page StewardOS rendered from an email that had no attachment, and the filing agent needs it: when one charge ends
  // up with both, only one file belongs in the card folder, and it should be the vendor's.
  const docSource = row.origin === "Email body" ? "email-body" : "upload";
  const who = user.email ?? "member";
  const name = (row.suggested_name as string | null) || row.title;
  const done: string[] = [];
  const filed: Record<string, unknown> = {};
  const wantClaim = answer === FILE_CLAIM;

  // 0. A statement: linked to its account for the period, filed under Statements, never turned into a receipt.
  if (r.kind === "statement") {
    const { data: accts } = await sb.from("accounts").select("id,institution,last4,retired_at");
    const list = ((accts ?? []) as AccountRow[]).filter((a) => !a.retired_at);
    const acct = accountFromAnswer(list, answer) ?? matchAccount(list, r.card_last4);
    if (!acct) {
      await sb.from("inbox_items").update({ missing: "Which account is this statement for?", options: [...list.map((a) => `${a.institution} ····${a.last4}`), "Something else"] }).eq("id", inboxId);
      return { ok: true, summary: "Which account is it for?", kept: true };
    }
    const period = (r.statement_period && /^\d{4}-\d{2}$/.test(r.statement_period) ? r.statement_period : null) ?? (r.closing_date ?? r.date ?? new Date().toISOString()).slice(0, 7);
    const sName = statementName(period, acct);
    const { data: st, error } = await sb.from("account_statements").upsert({ account_id: acct.id, period, inbox_id: inboxId, file_path: row.file_path, name: sName, closing_date: r.closing_date ?? null, statement_balance: typeof r.statement_balance === "number" ? r.statement_balance : null, due_date: r.due_date ?? null, filed_by: who }, { onConflict: "inbox_id" }).select("id").maybeSingle();
    if (error) return { ok: false, summary: `Could not file the statement: ${error.message}` };
    filed.statement_id = st?.id ?? null; filed.account_id = acct.id; filed.period = period;
    await sb.from("inbox_items").update({ status: "resolved", resolution: answer, resolved_at: new Date().toISOString(), resolved_by: user.id, filed, title: sName }).eq("id", inboxId);
    await sb.from("activity_log").insert({ actor: who, action: "statement_filed", subject: sName.slice(0, 80), ref: inboxId, undoable: false }).then(() => {}, () => {});
    await recordOutcome(sb, { kind: "inbox_item", id: inboxId, feature: "capture-read", outcome: "accepted" }).catch(() => null);
    return { ok: true, summary: `Filed: ${sName}. The monthly routine step for this account ticks itself.` };
  }

  // 0b. A vehicle receipt is never filed without a vehicle. The paper's hint or the person's answer must name exactly one;
  //     otherwise ask again. "Not a vehicle receipt" is the only way out: it becomes an ordinary receipt, shown for one more tap.
  const { data: vs } = await sb.from("vehicles").select("id,name,short,make,model,year,details");
  if (answer === NOT_VEHICLE) {
    const rr: Record<string, unknown> = { ...(row.read_result as Record<string, unknown>), category: "other", warranty_relevant: false, lines: (((row.read_result as { lines?: Line[] }).lines) ?? []).map((l) => (l.category === "vehicle" ? { ...l, category: "other" } : l)) };
    rr.plan = ((rr.plan as ({ t: string; text: string } | string)[] | undefined) ?? []).filter((p) => !/service history|warranty list|No vehicle matched/.test(typeof p === "string" ? p : p.text));
    await sb.from("inbox_items").update({ read_result: rr, missing: "Filing it as an ordinary receipt, not a vehicle one. Is that right?", options: ["Yes, file it", "Not quite"] }).eq("id", inboxId);
    return { ok: true, summary: "Okay, treating it as an ordinary receipt. Tap Yes to file it.", kept: true };
  }
  if ((r.category === "vehicle" || vehicleLines(r.lines).length > 0) && !vehicleFor(r.vehicle_pick ?? r.for_vehicle_hint, answer, (vs ?? []) as VRow[])) {
    const names = ((vs ?? []) as VRow[]).map((v) => v.name);
    await sb.from("inbox_items").update({ missing: "Which vehicle is it for? A vehicle receipt needs one before it can be filed.", options: [...names, NOT_VEHICLE] }).eq("id", inboxId);
    return { ok: true, summary: "Which vehicle is it for?", kept: true };
  }

  // 1. Money › Receipts, unless the same merchant, amount and date is already there.
  const orderNo = extractOrderNumber(r.order_number);
  if (orderNo || (r.vendor && typeof r.amount === "number" && r.amount > 0 && r.date)) {
    // Exact matches link silently. A near match waits for the person's answer: same purchase, or a different one.
    let same: Awaited<ReturnType<typeof findSameReceipt>> = null;
    if (orderNo && answer !== FILE_DIFFERENT) {
      // An order number outranks name, amount and date. Same total (or no total on the paper): attach quietly. A different total waits for "Same purchase, attach it".
      const o = await findOrderReceipt(sb, orderNo);
      if (o && (typeof r.amount !== "number" || amountsMatch(Number(o.amount), r.amount) || answer === FILE_SAME)) same = o;
    }
    if (!same && answer !== FILE_DIFFERENT && r.vendor && typeof r.amount === "number" && r.amount > 0 && r.date) same = await findSameReceipt(sb, String(r.vendor), r.amount, String(r.date));
    if (!same && answer === FILE_SAME) {
      const nid = (r as { near_receipt?: { id?: string } }).near_receipt?.id;
      if (nid) same = ((await sb.from("receipts").select("*").eq("id", nid).is("duplicate_of", null).maybeSingle()).data as typeof same) ?? null;
    }
    if (same) {
      // Same purchase already filed: keep that row (first wins), fill only its empty fields, link this document to it.
      const patch = blanksToFill(same, { file_path: row.file_path, captured_by: who });
      if (Object.keys(patch).length) await sb.from("receipts").update(patch).eq("id", same.id);
      await attachDocument(sb, same.id, { inbox_id: inboxId, path: (row.file_path as string | null) ?? null, name: name ?? null, source: docSource });
      filed.duplicate_of = same.id; filed.receipt_id = same.id; done.push("already in Receipts (this document attached to it, not added twice)");
    }
    else if (r.vendor && typeof r.amount === "number" && r.amount > 0 && r.date) {
      const { data: rc, error } = await sb.from("receipts").insert({ merchant: r.vendor, amount: r.amount, date: r.date, external_ref: orderNo && answer !== FILE_DIFFERENT ? `amazon:${orderNo}` : null, source: "upload", file_path: row.file_path, status: "expecting_charge", entity: null, captured_by: who, uploaded_by: user.id, documents: [{ inbox_id: inboxId, path: row.file_path ?? null, name: name ?? null, source: docSource, added_at: new Date().toISOString() }] }).select("id").single();
      if (!error && rc) { filed.receipt_id = rc.id; done.push("Receipts, waiting for its card charge"); }
    }
  }

  // 1b. The card printed on the receipt is one vote for which card paid (medium confidence; a tap or a statement outranks it).
  if (filed.receipt_id && r.card_last4 && /^\d{4}$/.test(String(r.card_last4))) {
    // A listed card wins (D-2026-10-27: card → account); else a label typed on an earlier receipt with the same last four.
    const listed = await sb.from("payment_cards").select("network, form, label, last4, accounts(kind)").eq("last4", r.card_last4).is("retired_at", null).limit(2);
    const lc = ((listed.data ?? []) as unknown) as { network: string | null; form: string; label: string | null; last4: string; accounts: { kind: string } | { kind: string }[] | null }[];
    const kindOf = (k?: string) => k === "checking" || k === "savings" ? "debit" : k === "credit" || k === "business" ? "credit" : "wallet";
    const acctKind = (a: { kind: string } | { kind: string }[] | null) => (Array.isArray(a) ? a[0]?.kind : a?.kind);
    const fromListed = lc.length === 1 ? `${lc[0].network ? `${lc[0].network} ` : ""}${kindOf(acctKind(lc[0].accounts))}${lc[0].form === "virtual" ? ` (${lc[0].label || "virtual"})` : lc[0].label ? ` (${lc[0].label})` : ""} ••${lc[0].last4}` : null;
    const rows = fromListed ? { data: [] } : await sb.from("receipts").select("card").not("card", "is", null).limit(200);
    const known = fromListed ?? ((rows.data ?? []) as { card: string }[]).map((x) => x.card).find((c) => c.replace(/\D/g, "").slice(-4) === r.card_last4);
    await sb.rpc("record_card_vote", { p_receipt: filed.receipt_id as string, p_source: "receipt_text", p_card: known ?? `${r.card_brand && r.card_brand !== "null" ? r.card_brand : "Card"} ${r.card_last4}`, p_conf: "medium" });
  }

  // 1c. "Paid with", chosen on the card, outranks the card printed on the paper. Skipped = left without a card for now.
  if (filed.receipt_id && !filed.duplicate_of && r.paid_with?.value) {
    const v = r.paid_with.value.slice(0, 40);
    const { error: ve } = await sb.rpc("record_card_vote", { p_receipt: filed.receipt_id as string, p_source: "you", p_card: v, p_conf: "high" });
    if (!ve) done.push(`paid with ${v}`);
  } else if (filed.receipt_id && !filed.duplicate_of && r.paid_with?.skipped) filed.card_skipped = true;

  // 2. The vehicle: service history and any warranty the paper states.
  let vehicle: VRow | null = null;
  if (r.category === "vehicle" || vehicleLines(r.lines).length > 0 || r.warranty_relevant) vehicle = vehicleFor(r.vehicle_pick ?? r.for_vehicle_hint, answer, (vs ?? []) as VRow[]);
  if (vehicle) {
    const d = { ...(vehicle.details ?? {}) } as Record<string, unknown>;
    const log = ((d.serviceLog as Array<Record<string, string>>) ?? []).slice();
    const what = r.item ?? "Service";
    // A mixed receipt links only its vehicle lines (each with its own amount); the proof is the whole receipt. Otherwise one entry for the receipt.
    const vl = r.category === "mixed" ? vehicleLines(r.lines) : [];
    const entries = vl.length ? vl.map((l) => ({ what: lineLabel(l, r), cost: l.amount })) : [{ what, cost: r.amount ?? null }];
    for (const en of entries) {
      const sameLine = (e: Record<string, string>) => e.date === (r.date ?? "") && (e.what === en.what || (en.cost != null && Number(e.cost) === Number(en.cost) && normalizeVendor(e.shop) === normalizeVendor(r.vendor)));
      if (!log.some(sameLine)) log.push({ date: r.date ?? "", miles: "", what: en.what, shop: r.vendor ?? "", cost: en.cost != null ? String(en.cost) : "", proof: name });
    }
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
