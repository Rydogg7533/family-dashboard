// Money (F2, F7): types, sample data and readers. Money is recorded, never moved: nothing here pays,
// transfers, cancels or disputes; every such action becomes a task. No account numbers beyond last-4.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { categorySpend, type SpendSummary, type SpendRow } from "@/lib/money-spend";

export type Account = {
  id: string; kind: "credit" | "checking" | "savings" | "payment_app" | "business"; institution: string; last4: string;
  owner: "Ryan" | "Melissa" | "Joint" | string; entity: string; statement_close_day: number | null; due_day: number | null;
  autopay: boolean; balance_current: number | null; balance_statement: number | null; last_reconciled: string | null;
  unreconciled: number; vault_item: string | null; synced_at: string; source: string; statement_arrival_day?: number | null; statement_delivery?: "email_pdf" | "email_link" | "upload"; retired_at?: string | null;
};
export type Transaction = {
  id: string; account_id: string; amount: number; merchant: string; date: string; category: string | null; entity: string;
  status: "matched" | "classified" | "unknown" | "personal" | "transfer" | "refund_pending" | "disputed" | "reimbursable";
  matched_receipt: string | null; note: string | null; searched: string[]; flag: string | null;
  for_person: string; captured_by: string; // "Always say who": whose purchase, who captured or synced it
};
export type Receipt = {
  id: string; merchant: string; amount: number; date: string; source: "email" | "camera" | "upload" | "bulk" | "organized";
  file_path: string | null; transaction_id: string | null; status: "matched" | "expecting_charge" | "unmatched" | "needs_info";
  question: string | null; thumbnail: string | null; entity: string | null; captured_by: string; card?: string | null; card_confidence?: string | null; card_conflict?: boolean; home_path?: string | null;
};
export type Reconciliation = {
  id: string; account_id: string; period: string; kind: "card" | "debit"; status: "open" | "done" | "exceptions";
  total_lines: number; tied_lines: number; to_explain: number; statement_total: number; due_at: string | null;
  for_person: string; summary: string | null; statement_file: string | null; tie_out?: { opening: number; deposits: number; withdrawals: number; closing: number; ok: boolean } | null;
};
export type RecurringItem = {
  id: string; name: string; kind: "subscription" | "bill" | "loan" | "insurance"; amount: number; cycle: "monthly" | "yearly" | "weekly";
  next_charge: string; account_id: string; entity: string; both_names: boolean; cancel_at: string | null;
  decision: "keep" | "cancel" | "downgrade" | "review"; last_negotiated: string | null; on_register: boolean; ack_waiting: string | null; decided_by: string;
};
export type CategorySpend = { category: string; spent: number; typical: number };
export type SpendingMonitor = { date: string; total_today: number; shared_with: string; daily_threshold: number; single_charge_alert: number; week_to_date: number; weekly_typical: number };

const now = Date.now();
const d = (days: number) => new Date(now + days * 86_400_000).toISOString().slice(0, 10);
const h = (n: number) => new Date(now - n * 3600_000).toISOString();

// ---- sample data (shown when Supabase is not configured) ----
export const sampleAccounts: Account[] = [
  { id: "amex-1004", kind: "credit", institution: "Amex", last4: "1004", owner: "Ryan", entity: "Personal", statement_close_day: 22, due_day: 17, autopay: true, balance_current: 1842.17, balance_statement: 3214.18, last_reconciled: d(-31), unreconciled: 3, vault_item: "Amex (Apple Passwords)", synced_at: h(3), source: "Tiller sheet" },
  { id: "chase-5521", kind: "checking", institution: "Chase", last4: "5521", owner: "Joint", entity: "Personal", statement_close_day: 30, due_day: null, autopay: false, balance_current: 6410.52, balance_statement: null, last_reconciled: d(-19), unreconciled: 1, vault_item: "Chase (Apple Passwords, shared)", synced_at: h(3), source: "Tiller sheet" },
  { id: "visa-3310", kind: "credit", institution: "Chase Visa", last4: "3310", owner: "Melissa", entity: "Personal", statement_close_day: 8, due_day: 3, autopay: true, balance_current: 612.4, balance_statement: 1088.9, last_reconciled: d(-12), unreconciled: 0, vault_item: "Visa (Apple Passwords)", synced_at: h(3), source: "Tiller sheet" },
  { id: "shvr-8802", kind: "business", institution: "Mercury", last4: "8802", owner: "Ryan", entity: "SHVR - Base-Drop Studio", statement_close_day: 31, due_day: null, autopay: false, balance_current: 2275.0, balance_statement: null, last_reconciled: d(-48), unreconciled: 4, vault_item: "Mercury (Apple Passwords)", synced_at: h(3), source: "Tiller sheet" },
  { id: "venmo", kind: "payment_app", institution: "Venmo", last4: "—", owner: "Ryan", entity: "Personal", statement_close_day: null, due_day: null, autopay: false, balance_current: 40.0, balance_statement: null, last_reconciled: d(-31), unreconciled: 0, vault_item: null, synced_at: h(26), source: "Venmo export" },
];

export const sampleTransactions: Transaction[] = [
  { id: "tx1", account_id: "amex-1004", amount: 148.32, merchant: "Costco", date: d(-3), category: null, entity: "Personal", status: "unknown", matched_receipt: null, note: null, searched: ["email (3 accounts)", "Organized/Finance", "financial inbox"], for_person: "Ryan", captured_by: "System (Tiller)", flag: null },
  { id: "tx2", account_id: "amex-1004", amount: 148.32, merchant: "Costco", date: d(-3), category: null, entity: "Personal", status: "unknown", matched_receipt: null, note: null, searched: ["email"], for_person: "Ryan", captured_by: "System (Tiller)", flag: "Possible duplicate: same merchant, amount and day" },
  { id: "tx3", account_id: "shvr-8802", amount: 412.0, merchant: "[Acrylic supplier]", date: d(-6), category: "Materials", entity: "SHVR - Base-Drop Studio", status: "unknown", matched_receipt: null, note: null, searched: ["email (admin@shvr.co)", "financial inbox"], for_person: "Ryan", captured_by: "System (Tiller)", flag: null },
  { id: "tx4", account_id: "chase-5521", amount: 39.0, merchant: "[Unknown merchant] POS 8821", date: d(-2), category: null, entity: "Personal", status: "unknown", matched_receipt: null, note: null, searched: ["email", "rules"], for_person: "Joint", captured_by: "System (Tiller)", flag: "New merchant, no rule" },
  { id: "tx5", account_id: "amex-1004", amount: 15.99, merchant: "[Streaming service]", date: d(-1), category: "Subscriptions", entity: "Personal", status: "classified", matched_receipt: null, note: null, searched: [], for_person: "Ryan", captured_by: "System (Tiller)", flag: "Price increase: was $13.99" },
  { id: "tx6", account_id: "amex-1004", amount: 86.4, merchant: "Smith's", date: d(-1), category: "Groceries", entity: "Personal", status: "matched", matched_receipt: "r1", note: null, searched: [], for_person: "Ryan", captured_by: "System (Tiller)", flag: null },
  { id: "tx7", account_id: "chase-5521", amount: 1200.0, merchant: "Transfer to savings", date: d(-4), category: "Transfer", entity: "Personal", status: "transfer", matched_receipt: null, note: "Matched both sides", searched: [], for_person: "Joint", captured_by: "System (Tiller)", flag: null },
  { id: "tx8", account_id: "visa-3310", amount: 54.2, merchant: "Target", date: d(-1), category: "Household", entity: "Personal", status: "matched", matched_receipt: "r2", note: null, searched: [], for_person: "Melissa", captured_by: "System (Tiller)", flag: null },
];

export const sampleReceipts: Receipt[] = [
  { id: "r1", merchant: "Smith's", amount: 86.4, date: d(-1), source: "email", file_path: "Organized/Personal/Documents/Finance/2026/Groceries/smiths-[date].pdf", transaction_id: "tx6", status: "matched", question: null, thumbnail: null, entity: "Personal", captured_by: "System (email, Ryan's Gmail)" },
  { id: "r2", merchant: "Target", amount: 54.2, date: d(-1), source: "email", file_path: "Organized/Personal/Documents/Finance/2026/Household/target-[date].pdf", transaction_id: "tx8", status: "matched", question: null, thumbnail: null, entity: "Personal", captured_by: "System (email, Ryan's Gmail)" },
  { id: "r3", merchant: "[Hardware store]", amount: 23.75, date: d(-2), source: "camera", file_path: null, transaction_id: null, status: "expecting_charge", question: null, thumbnail: null, entity: null, captured_by: "Ryan (camera)" },
  { id: "r4", merchant: "[Restaurant]", amount: 64.0, date: d(-9), source: "bulk", file_path: null, transaction_id: null, status: "needs_info", question: "Business or personal? If business, which entity?", thumbnail: null, entity: null, captured_by: "Melissa (bulk drop)" },
  { id: "r5", merchant: "[Pharmacy]", amount: 31.18, date: d(-14), source: "bulk", file_path: null, transaction_id: null, status: "needs_info", question: "Which account paid this? No charge found on any card.", thumbnail: null, entity: "Personal", captured_by: "Melissa (bulk drop)" },
];

export const sampleReconciliations: Reconciliation[] = [
  { id: "rec-amex-2026-10", account_id: "amex-1004", period: "Oct 2026", for_person: "Ryan", kind: "card", status: "open", total_lines: 47, tied_lines: 44, to_explain: 3, statement_total: 3214.18, due_at: d(3), summary: null, statement_file: "Finance/Statements/2026/amex-1004-2026-10.pdf" },
  { id: "rec-chase-2026-10", account_id: "chase-5521", period: "Oct 2026", for_person: "Joint", kind: "debit", status: "open", total_lines: 31, tied_lines: 30, to_explain: 1, statement_total: 0, due_at: d(9), summary: null, statement_file: null, tie_out: { opening: 5890.1, deposits: 4200.0, withdrawals: 3679.58, closing: 6410.52, ok: true } },
  { id: "rec-visa-2026-10", account_id: "visa-3310", period: "Oct 2026", for_person: "Melissa", kind: "card", status: "done", total_lines: 22, tied_lines: 22, to_explain: 0, statement_total: 1088.9, due_at: null, summary: "Visa 3310: 22 charges, $1,088.90, 0 missing receipts, 0 disputes", statement_file: "Finance/Statements/2026/visa-3310-2026-10.pdf" },
  { id: "rec-shvr-2026-09", account_id: "shvr-8802", period: "Sep 2026", for_person: "Ryan (SHVR)", kind: "debit", status: "exceptions", total_lines: 18, tied_lines: 14, to_explain: 4, statement_total: 0, due_at: d(-5), summary: null, statement_file: null, tie_out: { opening: 3120.0, deposits: 1500.0, withdrawals: 2345.0, closing: 2275.0, ok: true } },
];

export const sampleRecurring: RecurringItem[] = [
  { id: "rc1", name: "[Streaming service]", kind: "subscription", amount: 15.99, cycle: "monthly", next_charge: d(29), account_id: "amex-1004", entity: "Personal", both_names: true, cancel_at: "[Service] › Account › Cancel", decision: "review", last_negotiated: null, on_register: true, ack_waiting: "Melissa", decided_by: "Ryan" },
  { id: "rc2", name: "[Cloud storage 2 TB]", kind: "subscription", amount: 9.99, cycle: "monthly", next_charge: d(6), account_id: "amex-1004", entity: "Personal", both_names: false, cancel_at: "Apple ID › Subscriptions", decision: "keep", last_negotiated: null, on_register: true, ack_waiting: null, decided_by: "System (register)" },
  { id: "rc3", name: "[Design tool seat]", kind: "subscription", amount: 20.0, cycle: "monthly", next_charge: d(12), account_id: "shvr-8802", entity: "SHVR - Base-Drop Studio", both_names: false, cancel_at: "[Tool] › Billing", decision: "cancel", last_negotiated: null, on_register: true, ack_waiting: null, decided_by: "Ryan" },
  { id: "rc4", name: "Internet", kind: "bill", amount: 79.99, cycle: "monthly", next_charge: d(4), account_id: "chase-5521", entity: "Personal", both_names: true, cancel_at: null, decision: "keep", last_negotiated: "2026-03", on_register: true, ack_waiting: null, decided_by: "System (register)" },
  { id: "rc5", name: "Auto insurance (Tahoe, Sienna)", kind: "insurance", amount: 212.0, cycle: "monthly", next_charge: d(15), account_id: "chase-5521", entity: "Personal", both_names: true, cancel_at: null, decision: "keep", last_negotiated: "2025-11", on_register: true, ack_waiting: null, decided_by: "System (register)" },
  { id: "rc6", name: "[Fitness app]", kind: "subscription", amount: 12.99, cycle: "monthly", next_charge: d(2), account_id: "visa-3310", entity: "Personal", both_names: false, cancel_at: "App Store › Subscriptions", decision: "review", last_negotiated: null, on_register: false, ack_waiting: null, decided_by: "Melissa" },
  { id: "rc7", name: "[Domain renewals]", kind: "subscription", amount: 48.0, cycle: "yearly", next_charge: d(40), account_id: "shvr-8802", entity: "Veil Labs", both_names: false, cancel_at: "[Registrar] › Domains", decision: "keep", last_negotiated: null, on_register: true, ack_waiting: null, decided_by: "Ryan" },
];

export const sampleCategories: CategorySpend[] = [
  { category: "Groceries", spent: 612, typical: 780 },
  { category: "Dining", spent: 238, typical: 190 },
  { category: "Household", spent: 171, typical: 220 },
  { category: "Gas", spent: 142, typical: 160 },
  { category: "Kids", spent: 96, typical: 140 },
  { category: "Subscriptions", spent: 59, typical: 56 },
];

export const sampleMonitor: SpendingMonitor = { date: d(0), total_today: 86.4, shared_with: "Melissa", daily_threshold: 150, single_charge_alert: 250, week_to_date: 412.6, weekly_typical: 520 };

// ---- readers (sample fallback) ----
export async function getAccounts(): Promise<Account[]> {
  if (!hasSupabaseEnv()) return sampleAccounts;
  const sb = await createClient();
  const { data } = await sb.from("accounts").select("*").order("institution");
  return (data as Account[]) ?? [];
}
export async function getTransactions(): Promise<Transaction[]> {
  if (!hasSupabaseEnv()) return sampleTransactions;
  const sb = await createClient();
  const { data } = await sb.from("transactions").select("*").order("date", { ascending: false }).limit(200);
  return (data as Transaction[]) ?? [];
}
export async function getReceipts(): Promise<Receipt[]> {
  if (!hasSupabaseEnv()) return sampleReceipts;
  const sb = await createClient();
  const { data } = await sb.from("receipts").select("*").is("duplicate_of", null).order("date", { ascending: false }).limit(200);
  return (data as Receipt[]) ?? [];
}
export async function getReconciliations(): Promise<Reconciliation[]> {
  if (!hasSupabaseEnv()) return sampleReconciliations;
  const sb = await createClient();
  const { data } = await sb.from("reconciliations").select("*").order("period", { ascending: false });
  return (data as Reconciliation[]) ?? [];
}
export async function getRecurring(): Promise<RecurringItem[]> {
  if (!hasSupabaseEnv()) return sampleRecurring;
  const sb = await createClient();
  const { data } = await sb.from("recurring_items").select("*").order("next_charge");
  return (data as RecurringItem[]) ?? [];
}
export async function getCategorySpend(): Promise<CategorySpend[]> {
  // Derived from the transactions ledger in production; sample until then.
  return sampleCategories;
}
export async function getSpendingMonitor(): Promise<SpendingMonitor> {
  return sampleMonitor;
}

// Spending by category from the real ledger (this month, with a "typical" from earlier months). Samples only when not connected.
export async function getSpendSummary(): Promise<SpendSummary> {
  if (!hasSupabaseEnv()) return categorySpend(sampleCategories.flatMap((c) => [{ amount: c.spent, date: new Date().toISOString().slice(0, 10), category: c.category }, ...[1, 2, 3].flatMap((k) => Array.from({ length: 30 }, () => ({ amount: c.typical / 30, date: new Date(Date.now() - k * 32 * 86_400_000).toISOString().slice(0, 10), category: c.category })))]), new Date());
  const sb = await createClient();
  const since = new Date(); since.setMonth(since.getMonth() - 4); since.setDate(1);
  const rows: SpendRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("transactions").select("amount,date,category,status,merchant").gte("date", since.toISOString().slice(0, 10)).order("date", { ascending: false }).range(from, from + 999);
    rows.push(...((data ?? []) as SpendRow[]));
    if (!data || data.length < 1000) break;
  }
  return categorySpend(rows, new Date());
}

// ---- derived helpers ----
export const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const shortDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();
export const daysUntil = (iso: string) => Math.round((new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).getTime() - now) / 86_400_000);
export const accountLabel = (a: Account | undefined) => (a ? `${a.institution} ••${a.last4}` : "[Account]");

export type NeedsMeItem = { id: string; kind: "unmatched" | "ask" | "reconcile" | "due" | "flag" | "ack"; title: string; detail: string; who: string; href: string; effort: "tap" | "thought"; due?: string | null };

export function buildNeedsMe(tx: Transaction[], receipts: Receipt[], recs: Reconciliation[], recurring: RecurringItem[], accounts: Account[]): NeedsMeItem[] {
  const acc = (id: string) => accountLabel(accounts.find((a) => a.id === id));
  const items: NeedsMeItem[] = [];
  const whoTx = (t: Transaction) => `${t.for_person}'s card · from Tiller`;
  for (const t of tx.filter((t) => t.status === "unknown" && !t.flag)) items.push({ id: t.id, kind: "unmatched", who: whoTx(t), title: `Missing receipt: ${t.merchant} ${money(t.amount)}`, detail: `${acc(t.account_id)} · ${shortDate(t.date)} · looked in ${t.searched.join(", ") || "email"}`, href: `/money/receipts?for=${t.id}`, effort: "tap" });
  for (const r of receipts.filter((r) => r.status === "needs_info")) items.push({ id: r.id, kind: "ask", who: `${r.captured_by} · from financial inbox`, title: `${r.merchant} ${money(r.amount)}: ${r.question}`, detail: `From the financial inbox · ${shortDate(r.date)}`, href: `/money/receipts?item=${r.id}`, effort: "tap" });
  for (const r of recs.filter((r) => r.status !== "done")) items.push({ id: r.id, kind: "reconcile", who: `For ${r.for_person} · from Tiller`, title: `${r.status === "exceptions" ? "Close with exceptions" : "Close due"}: ${acc(r.account_id)} ${r.period}`, detail: `${r.to_explain} to explain · ${r.due_at ? (daysUntil(r.due_at) < 0 ? "overdue" : `due ${shortDate(r.due_at)}`) : "no date"}`, href: `/money/reconcile/${r.account_id}`, effort: "thought", due: r.due_at });
  for (const rc of recurring.filter((rc) => daysUntil(rc.next_charge) <= 7 && rc.kind !== "subscription" && !accounts.find((a) => a.id === rc.account_id)?.autopay)) items.push({ id: rc.id, kind: "due", who: `${rc.decided_by} · from the register`, title: `${rc.name} ${money(rc.amount)} due ${shortDate(rc.next_charge)}`, detail: `Not on autopay · ${acc(rc.account_id)} · task prepared, you pay`, href: `/money/recurring`, effort: "thought", due: rc.next_charge });
  for (const t of tx.filter((t) => t.flag)) items.push({ id: `f-${t.id}`, kind: "flag", who: whoTx(t), title: `${t.flag}`, detail: `${t.merchant} ${money(t.amount)} · ${acc(t.account_id)} · ${shortDate(t.date)}`, href: `/money/receipts?for=${t.id}`, effort: "tap" });
  for (const rc of recurring.filter((rc) => !rc.on_register)) items.push({ id: `nr-${rc.id}`, kind: "flag", who: `System · from Tiller`, title: `Recurring charge not on the register: ${rc.name}`, detail: `${money(rc.amount)} ${rc.cycle} · ${acc(rc.account_id)} · add it or explain`, href: `/money/subscriptions`, effort: "tap" });
  for (const rc of recurring.filter((rc) => rc.ack_waiting)) items.push({ id: `ack-${rc.id}`, kind: "ack", who: `${rc.decided_by} asked · from Subscriptions`, title: `Acknowledge: ${rc.name} marked "${rc.decision}"`, detail: `Two-party rule · waiting on ${rc.ack_waiting}`, href: `/money/subscriptions`, effort: "tap" });
  // F15 item 1: 30-second taps first, then needs-thought; due date within each.
  return items.sort((a, b) => (a.effort === b.effort ? (a.due ?? "9").localeCompare(b.due ?? "9") : a.effort === "tap" ? -1 : 1));
}

// ---- F22 Records and proofs: no money event without proof; every confirmation kept until needed-until ----
export type RecordKind = "reservation" | "ticket" | "government" | "insurance_claim" | "warranty_return" | "appointment" | "service_contract" | "support_case" | "membership_license" | "receipt";
export type FamilyRecord = {
  id: string; kind: RecordKind; title: string; for_person: string | null; confirmation_number: string | null;
  happens_at: string | null; needed_until: string | null; retention_rule: string; file_ref: string | null;
  source_name: string; source_href: string; tax_year: number | null; status: "active" | "needed_soon" | "archived"; transaction_id?: string | null; requested_by: string;
};
export type Proof = { id: string; transaction_id: string; kind: "digital_receipt" | "photo" | "statement_line"; source_href: string; captured_at: string };
export type ProofState = "green" | "amber" | "red";

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  reservation: "Reservation", ticket: "Ticket or pass", government: "Government", insurance_claim: "Insurance and claims", warranty_return: "Warranty or return",
  appointment: "Appointment", service_contract: "Service or contract", support_case: "Support case", membership_license: "Membership or license", receipt: "Receipt",
};
export const RETENTION_RULE: Record<RecordKind, string> = {
  reservation: "stay end + 30 days", ticket: "the event, then archive", government: "7 years (filings, tax payments) or until renewal", insurance_claim: "claim closed + 1 year",
  warranty_return: "window end", appointment: "the date", service_contract: "job complete + warranty", support_case: "confirmed resolution", membership_license: "renewal", receipt: "tax year + 7 years",
};

export const sampleRecords: FamilyRecord[] = [
  { id: "rec1", kind: "reservation", title: "Moab hotel, Nov 3–5", for_person: "Family", confirmation_number: "8X4K2", happens_at: "2026-11-03", needed_until: "2026-12-05", retention_rule: RETENTION_RULE.reservation, file_ref: "Records/2026/reservation/moab-hotel-8X4K2.pdf", source_name: "Gmail", source_href: "#", tax_year: null, status: "needed_soon", requested_by: "Ryan asked (Ask)" },
  { id: "rec2", kind: "government", title: "Utah estimated tax payment Q3", for_person: "Ryan", confirmation_number: "[CONF-NUMBER]", happens_at: d(-33), needed_until: "2033-10-15", retention_rule: RETENTION_RULE.government, file_ref: "Records/2026/government/ut-est-tax-q3.pdf", source_name: "Gmail", source_href: "#", tax_year: 2026, status: "active", requested_by: "System (email funnel)" },
  { id: "rec3", kind: "warranty_return", title: "[Retailer] return authorization, [item]", for_person: "Melissa", confirmation_number: "RMA-[NUMBER]", happens_at: null, needed_until: d(2), retention_rule: RETENTION_RULE.warranty_return, file_ref: null, source_name: "Gmail", source_href: "#", tax_year: null, status: "needed_soon", requested_by: "Melissa" },
  { id: "rec4", kind: "appointment", title: "[Child 1] dentist, [DATE] 3:30 pm", for_person: "[Child 1]", confirmation_number: null, happens_at: d(9), needed_until: d(9), retention_rule: RETENTION_RULE.appointment, file_ref: null, source_name: "Messages", source_href: "#", tax_year: null, status: "active", requested_by: "System (email funnel)" },
  { id: "rec5", kind: "membership_license", title: "Costco membership", for_person: "Family", confirmation_number: "[MEMBER-NUMBER]", happens_at: null, needed_until: d(140), retention_rule: RETENTION_RULE.membership_license, file_ref: "Records/2026/membership_license/costco.pdf", source_name: "Gmail", source_href: "#", tax_year: null, status: "active", requested_by: "System (email funnel)" },
  { id: "rec6", kind: "insurance_claim", title: "Auto claim, Tahoe windshield", for_person: "Ryan", confirmation_number: "CLM-[NUMBER]", happens_at: d(-20), needed_until: null, retention_rule: RETENTION_RULE.insurance_claim, file_ref: "Records/2026/insurance_claim/tahoe-windshield.pdf", source_name: "Gmail", source_href: "#", tax_year: null, status: "active", requested_by: "System (email funnel)" },
  { id: "rec7", kind: "ticket", title: "[Event] tickets ×4", for_person: "Family", confirmation_number: "[ORDER]", happens_at: d(-40), needed_until: d(-40), retention_rule: RETENTION_RULE.ticket, file_ref: "Records/2026/ticket/event.pdf", source_name: "Gmail", source_href: "#", tax_year: null, status: "archived", requested_by: "System (email funnel)" },
  { id: "rec8", kind: "service_contract", title: "[Roofer] quote and deposit", for_person: "Family", confirmation_number: null, happens_at: d(-120), needed_until: "2031-06-01", retention_rule: RETENTION_RULE.service_contract, file_ref: "Records/2026/service_contract/roofer.pdf", source_name: "Files", source_href: "#", tax_year: 2026, status: "active", requested_by: "System (email funnel)" },
  { id: "rec9", kind: "receipt", title: "Smith's $86.40", for_person: "Family", confirmation_number: null, happens_at: d(-1), needed_until: "2033-12-31", retention_rule: RETENTION_RULE.receipt, file_ref: "Finance/2026/Groceries/smiths-[date].pdf", source_name: "Gmail", source_href: "#", tax_year: null, status: "active", transaction_id: "tx6", requested_by: "System (email funnel)" },
];

export const sampleProofs: Proof[] = [
  { id: "p1", transaction_id: "tx6", kind: "digital_receipt", source_href: "#", captured_at: h(20) },
  { id: "p2", transaction_id: "tx6", kind: "photo", source_href: "#", captured_at: h(23) },
  { id: "p3", transaction_id: "tx6", kind: "statement_line", source_href: "#", captured_at: h(3) },
  { id: "p4", transaction_id: "tx8", kind: "digital_receipt", source_href: "#", captured_at: h(22) },
  { id: "p5", transaction_id: "tx8", kind: "statement_line", source_href: "#", captured_at: h(3) },
  { id: "p6", transaction_id: "tx5", kind: "statement_line", source_href: "#", captured_at: h(3) },
  { id: "p7", transaction_id: "tx7", kind: "statement_line", source_href: "#", captured_at: h(3) },
];

export async function getRecords(): Promise<FamilyRecord[]> {
  if (!hasSupabaseEnv()) return sampleRecords;
  const sb = await createClient();
  const { data } = await sb.from("records").select("*").order("needed_until", { ascending: true, nullsFirst: false });
  return (data as FamilyRecord[]) ?? [];
}
export async function getProofs(): Promise<Proof[]> {
  if (!hasSupabaseEnv()) return sampleProofs;
  const sb = await createClient();
  const { data } = await sb.from("proofs").select("*");
  return (data as Proof[]) ?? [];
}

// Proof state: green = digital + photo (statement line alone does not count toward green); amber = one
// proof beyond the statement line, or statement line only; red = none at all.
export function proofState(txId: string, proofs: Proof[]): { state: ProofState; have: Proof["kind"][]; ask: string | null } {
  const have = proofs.filter((p) => p.transaction_id === txId).map((p) => p.kind);
  const digital = have.includes("digital_receipt"), photo = have.includes("photo"), stmt = have.includes("statement_line");
  if (digital && photo) return { state: "green", have, ask: null };
  if (digital) return { state: "amber", have, ask: "Was there a paper receipt? Snap it for the second proof." };
  if (photo) return { state: "amber", have, ask: "Find the e-receipt in email?" };
  if (stmt) return { state: "amber", have, ask: "Statement line only. Snap the receipt, or find it in email?" };
  return { state: "red", have, ask: "No proof. Snap the receipt, find it in email, or explain." };
}
export const PROOF_LABEL: Record<Proof["kind"], string> = { digital_receipt: "digital", photo: "photo", statement_line: "statement line" };

export async function getSubjects(): Promise<{ subjects: import("@/lib/subjects").Subject[]; links: { receipt_id: string; subject_id: string }[] }> {
  if (!hasSupabaseEnv()) return { subjects: [], links: [] };
  const sb = await createClient();
  const [a, b] = await Promise.all([sb.from("subjects").select("id,kind,name").order("name"), sb.from("receipt_subjects").select("receipt_id,subject_id").is("removed_at", null)]);
  return { subjects: (a.data ?? []) as { id: string; kind: string; name: string }[], links: (b.data ?? []) as { receipt_id: string; subject_id: string }[] };
}
