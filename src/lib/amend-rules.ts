// Fixing a receipt that was already answered (card redesign step 3). Pure helpers, client-safe.
// Safe to amend only while nothing outside the app holds the old wording: no file copied to the folders under the old name, no service-history or claim entry
// quoting it, and (for vendor, amount, date) no bank charge matched to it. Otherwise the person is told why, and nothing changes.
export type AmendContext = { copied_path?: string | null; filed?: Record<string, unknown> | null; kind?: string | null; transaction_id?: string | null };

// Why the whole record cannot be amended (null = it can).
export function amendBlock(c: AmendContext): string | null {
  const f = c.filed ?? {};
  if (c.kind === "statement") return "A statement is not edited here.";
  if (!f.receipt_id) return "Only a filed receipt can be fixed here.";
  if (f.duplicate_of) return "This was attached to a receipt already on file; fix that receipt instead.";
  if (c.copied_path) return "Its file is already copied into your folders under the old name. Renaming copied files comes later.";
  if (f.vehicle_id) return "It is in a vehicle's service history, which quotes the old wording. Fix it there for now.";
  if (f.claim_id) return "It is attached to a claim, which quotes the old wording. Fix it there for now.";
  return null;
}

// Why one field cannot change (null = it can). A matched charge was matched on vendor, amount and date.
export function fieldBlock(field: string, c: AmendContext): string | null {
  if (["vendor", "amount", "date"].includes(field) && c.transaction_id) return "A bank charge is already matched to this receipt on its vendor, amount and date, so those are locked.";
  return null;
}
