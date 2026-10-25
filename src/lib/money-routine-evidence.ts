// Evidence rules for the monthly money routine: database checks only (no model, no network). Each rule says whether a step is met
// this period and, when it is not, a short line saying what the app still sees. Rules only ever CLOSE an open step; a person's Done
// or Skip is never overwritten, and a step that becomes unmet again later stays done for that month.
import type { createClient } from "@/lib/supabase/server";
import { AMAZON_INVOICES_KEY, AMAZON_INVOICE_DEFAULT, checkAmazonInvoiceSetting } from "@/lib/amazon-invoice-setting";

type Sb = Awaited<ReturnType<typeof createClient>>;
export type Evidence = { met: boolean; line: string };           // line: what the app sees, in plain words
const DAY = 86400_000;
const todayDenver = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
const daysAgoIso = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

async function tillerFill(sb: Sb): Promise<Evidence> {
  const { data } = await sb.from("transactions").select("date").order("date", { ascending: false }).limit(1);
  const newest = data?.[0]?.date as string | undefined;
  if (!newest) return { met: false, line: "no charges loaded yet" };
  const age = daysBetween(newest, todayDenver());
  return age <= 7 ? { met: true, line: `newest charge ${newest}` } : { met: false, line: `the app still sees ${newest} as the newest charge (${age} days old)` };
}
async function amazonInvoices(sb: Sb): Promise<Evidence> {
  const { data: s } = await sb.from("household_settings").select("value").eq("key", AMAZON_INVOICES_KEY).maybeSingle();
  const min = (checkAmazonInvoiceSetting(s?.value) ?? AMAZON_INVOICE_DEFAULT).ask_min_amount;
  const { data } = await sb.from("receipts").select("documents, amount").like("external_ref", "amazon:%").is("duplicate_of", null).gte("amount", min);
  const missing = (data ?? []).filter((r) => !Array.isArray(r.documents) || r.documents.length === 0).length;
  return missing ? { met: false, line: `${missing} Amazon order${missing === 1 ? "" : "s"} at $${min}+ still without an invoice` } : { met: true, line: "every Amazon order at or above the threshold has a document" };
}
async function inboxAnswer(sb: Sb): Promise<Evidence> {
  const { data } = await sb.from("inbox_items").select("captured_at").eq("status", "open").lt("captured_at", daysAgoIso(7)).order("captured_at").limit(500);
  const n = data?.length ?? 0;
  if (!n) return { met: true, line: "nothing in the Inbox older than 7 days" };
  const oldest = Math.round((Date.now() - Date.parse(data![0].captured_at as string)) / DAY);
  return { met: false, line: `${n} Inbox item${n === 1 ? "" : "s"} waiting, oldest ${oldest} days` };
}
async function chargesUnmatched(sb: Sb): Promise<Evidence> {
  const { count } = await sb.from("transactions").select("id", { count: "exact", head: true }).eq("status", "unknown").like("flag", "[match] No receipt found%").lt("date", daysAgoIso(30).slice(0, 10));
  return count ? { met: false, line: `${count} charge${count === 1 ? "" : "s"} with no receipt, older than 30 days` } : { met: true, line: "no charge has been without a receipt for more than 30 days" };
}
async function transfersConfirm(sb: Sb): Promise<Evidence> {
  const { data } = await sb.from("transactions").select("category, merchant").eq("status", "unknown").limit(2000);
  const n = (data ?? []).filter((t) => /transfer|credit card payment|loan payment|payment/i.test(String(t.category ?? "")) || /\btransfer\b|payment thank you|autopay|online payment/i.test(String(t.merchant ?? ""))).length;
  return n ? { met: false, line: `${n} charge${n === 1 ? "" : "s"} that look like transfers still unconfirmed` } : { met: true, line: "no unconfirmed transfers" };
}
async function recurringCandidates(sb: Sb): Promise<Evidence> {
  const { count } = await sb.from("subscription_candidates").select("id", { count: "exact", head: true }).eq("status", "asking");
  return count ? { met: false, line: `${count} subscription candidate${count === 1 ? "" : "s"} waiting for Yes or No` } : { met: true, line: "no subscription candidates waiting" };
}
async function sharedAcknowledge(sb: Sb): Promise<Evidence> {
  const { count } = await sb.from("recurring_items").select("id", { count: "exact", head: true }).not("ack_waiting", "is", null);
  return count ? { met: false, line: `${count} change${count === 1 ? "" : "s"} waiting for the other parent` } : { met: true, line: "no acknowledgements waiting" };
}
// A statement for this account and period: an Inbox document the reader called a statement, carrying the account's last four, captured this month or the next.
async function statement(sb: Sb, period: string, last4: string | null, accountId: string | null): Promise<Evidence> {
  // First choice: a filed statement row for this account (any period filed this month or the one before counts; statements close on their own cycle).
  if (accountId) {
    const [y, m] = period.split("-").map(Number);
    const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
    const { data } = await sb.from("account_statements").select("period, name").eq("account_id", accountId).in("period", [period, prev]).limit(1);
    if (data?.length) return { met: true, line: `filed: ${data[0].name}` };
  }
  if (!last4) return { met: false, line: "no last four on this account; mark it by hand" };
  const [y, m] = period.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString(), to = new Date(Date.UTC(y, m + 1, 1)).toISOString();
  const { data } = await sb.from("inbox_items").select("read_result").gte("captured_at", from).lt("captured_at", to).not("read_result", "is", null).limit(1000);
  const hit = (data ?? []).some((i) => { const r = i.read_result as { kind?: string; card_last4?: string | null } | null; return r?.kind === "statement" && String(r.card_last4 ?? "").replace(/\D/g, "").slice(-4) === last4; });
  return hit ? { met: true, line: `a statement ending ····${last4} was dropped in the Inbox this period` } : { met: false, line: "no statement for this account in the Inbox yet" };
}

// null = the app cannot prove this step yet (manual only).
export async function evidenceFor(sb: Sb, key: string, period: string, accountLast4: string | null, accountId: string | null = null): Promise<Evidence | null> {
  if (key === "tiller:fill") return tillerFill(sb);
  if (key === "amazon:invoices") return amazonInvoices(sb);
  if (key === "inbox:answer") return inboxAnswer(sb);
  if (key === "charges:unmatched") return chargesUnmatched(sb);
  if (key === "transfers:confirm") return transfersConfirm(sb);
  if (key === "recurring:candidates") return recurringCandidates(sb);
  if (key === "shared:acknowledge") return sharedAcknowledge(sb);
  if (key.startsWith("statement:")) return statement(sb, period, accountLast4 ?? key.match(/(\d{4})$/)?.[1] ?? null, accountId);
  return null;   // amazon:history waits for the order-history reader
}
