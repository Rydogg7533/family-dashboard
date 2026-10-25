// Inbox status and kind, worked out from what an item already holds. Pure helpers (client-safe, no I/O).
//   needs_answer : a plan is ready; one tap decides it ("Yes, file it", "Same purchase", or a decision with its choices).
//   missing_info : a fact is missing before a plan can be made (which vehicle, which account, what is this, unreadable).
// "Handed over" is not a status of its own: it is a separate flag (assigned_to), so a handed item still shows its real status.
// The answers that mean "a plan is ready" (must equal FILE_YES and FILE_SAME in inbox-answers.ts; scripts/inbox-status-test.mjs checks).
export const READY_ANSWERS = ["Yes, file it", "Same purchase, attach it"];

export type InboxStatus = "needs_answer" | "missing_info";
export type StatusInput = { kind: string; file_path?: string | null; options: string[]; missing: string; assigned_to?: string | null; read_result?: Record<string, unknown> | null };

export function inboxStatus(i: StatusInput): InboxStatus {
  const ready = (i.options ?? []).some((o) => READY_ANSWERS.includes(o));
  if (ready || i.kind === "decide") return "needs_answer";
  return "missing_info";
}

// An open item whose "Paid with" question was skipped (nothing chosen). It stays in the Inbox until the person answers; this only gathers them.
export function isPaidWithSkipped(i: Pick<StatusInput, "read_result">): boolean {
  const pw = (i.read_result as { paid_with?: { skipped?: boolean; value?: string } } | null | undefined)?.paid_with;
  return !!pw && pw.skipped === true && !pw.value;
}

// A few words naming what is missing, for the tag on a missing-info row.
export function missingNote(i: Pick<StatusInput, "missing" | "read_result">): string {
  const m = (i.missing ?? "").toLowerCase();
  if (i.read_result && "error" in i.read_result) return "could not read it";
  if (/what is this|what is it|not sure/.test(m)) return "what it is";
  if (/which vehicle/.test(m)) return "vehicle";
  if (/which account/.test(m)) return "account";
  if (/which child|who is it for|who is this/.test(m)) return "who it is for";
  if (/paid with|which card/.test(m)) return "paid with";
  return "an answer";
}

export const KIND_ORDER = ["Receipts", "Bills", "Statements", "Amazon", "Other"] as const;
export type DocKind = (typeof KIND_ORDER)[number];

// What went in, by the reader's kind; Amazon when an order number was read; anything unread or non-document is Other.
export function docKind(i: Pick<StatusInput, "read_result">): DocKind {
  const r = i.read_result ?? {};
  if (r.order_number) return "Amazon";
  const k = String(r.kind ?? "").toLowerCase();
  if (k === "receipt") return "Receipts";
  if (k === "bill") return "Bills";
  if (k === "statement") return "Statements";
  return "Other";
}

export function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of items) out[key(t)] = (out[key(t)] ?? 0) + 1;
  return out;
}

// One plain line for a decided item: what the tap did, from the record of what was filed.
export function decidedOutcome(filed: Record<string, unknown> | null | undefined, resolution: string | null | undefined): string {
  const f = filed ?? {};
  if (f.duplicate_of) return "Attached to a receipt already filed";
  if (Object.keys(f).some((k) => k.includes("statement"))) return "Statement filed";
  if (f.receipt_id) return "Filed as a receipt, expecting a charge";
  if (resolution) return `Answered: ${resolution.length > 60 ? `${resolution.slice(0, 57)}…` : resolution}`;
  return "Resolved";
}

export const DECIDED_DAYS = 30;
