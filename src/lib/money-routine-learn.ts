// Learning routine steps from what the household actually does (pure rules; no model). Client-safe: no server imports.
// An observation is one money-related human action with a Denver date. Kinds come from the activity log and from Inbox filings.
// A kind seen in two or more different months, that is not already a routine step, becomes a candidate. Nothing is added
// without a person's "Yes, every month".

export type Observation = { kind: string; day: string };           // kind like "activity:email_receipts", day YYYY-MM-DD (Denver)
export type Candidate = { key: string; label: string; months: string[]; times: number; typical_day: number };

// Only money-related human actions are watched. The label is what the step would be called.
export const WATCHED: Record<string, string> = {
  "activity:email_receipts": "Run the email receipt scan",
  "activity:claim_opened": "Open reimbursement claims for what is owed back",
  "activity:claim_status": "Follow up open reimbursement claims",
  "activity:mail_filed": "File money mail into its folders",
  "activity:capture_bulk": "Drop the month's receipts in bulk",
  "filed:statement": "File the month's statements",
  "filed:bill": "File the month's bills",
  "filed:receipt": "File receipts that arrived on paper or by photo",
  "filed:form": "File forms and notices",
};
// Observation kinds that an existing seeded step already covers; never offered again.
export const COVERED: Record<string, string> = { "filed:statement": "statement:*" };

export const monthOf = (day: string) => day.slice(0, 7);
export const median = (ns: number[]) => { const s = [...ns].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 15; };

export function findCandidates(obs: Observation[], existingStepKeys: string[], minMonths = 2): Candidate[] {
  const by = new Map<string, Observation[]>();
  for (const o of obs) { if (!(o.kind in WATCHED)) continue; if (!by.has(o.kind)) by.set(o.kind, []); by.get(o.kind)!.push(o); }
  const out: Candidate[] = [];
  for (const [kind, list] of by) {
    if (kind in COVERED) continue;
    if (existingStepKeys.includes(`learned:${kind}`)) continue;
    const months = [...new Set(list.map((o) => monthOf(o.day)))].sort();
    if (months.length < minMonths) continue;
    out.push({ key: kind, label: WATCHED[kind], months, times: list.length, typical_day: Math.min(28, median(list.map((o) => Number(o.day.slice(8, 10))))) });
  }
  return out.sort((a, b) => b.months.length - a.months.length || b.times - a.times);
}
