// Inbox (ongoing ingestion, F2 bulk drops, F4 unplaced Ask threads): items that need a person to identify,
// file or decide. Each item asks exactly what is missing and stays until resolved; nothing expires.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { copyState, isFiledByCard, type DestRead } from "@/lib/destination";
import { amendBlock } from "@/lib/amend-rules";
import { normalizeVendor } from "@/lib/receipt-match";
import { suggestCard, suggestionReason, CASH, type CardHistory } from "@/lib/paid-with";

export type InboxItem = {
  id: string;
  kind: "identify" | "file" | "decide" | "ask_thread";
  title: string;
  origin: string;              // "Bulk drop", "Photo", "Email attachment from …", "Ask, 2 days ago"
  origin_href: string;         // "Open in …" target ("#" until the source has a deep link)
  origin_label: string;        // "Finder", "Gmail", "Ask"
  requested_by: string;        // "Always say who": "Ryan", "Melissa", "System"
  for_person: string | null;   // whom it is about, when known
  captured_at: string;
  assigned_to?: string | null;  // handed to one parent; either may still answer
  created_by?: string | null;
  missing: string;             // the one question, in plain words
  options: string[];           // suggested answers as buttons; free text always allowed
  thread: { at: string; who: "you" | "assistant"; text: string }[] | null; // for ask_thread items
  status: "open" | "resolved";
  resolution: string | null;
  file_path?: string | null;   // stored capture (private bucket)
  read_at?: string | null;     // set once the file has been read
  suggested_name?: string | null;
  read_result?: { vendor?: string | null; kind?: string; paid_with?: { value?: string; skipped?: boolean }; home?: string; plan?: ({ t: "file" | "link"; text: string } | string)[]; claim_plan?: string } | null;
};

const now = Date.now();
const h = (n: number) => new Date(now - n * 3600_000).toISOString();

export const sampleInbox: InboxItem[] = [
  { id: "i1", kind: "identify", title: "Photo IMG_4471 (a form, one page)", origin: "Photo, taken yesterday", origin_href: "#", origin_label: "Photos", requested_by: "Ryan", for_person: null, captured_at: h(20), missing: "Which child is this form about?", options: ["[Child 1]", "[Child 2]", "Not a child's form"], thread: null, status: "open", resolution: null },
  { id: "i2", kind: "file", title: "[Dentist] statement, $[AMOUNT]", origin: "Email attachment from [Dentist office]", origin_href: "#", origin_label: "Gmail", requested_by: "System", for_person: "[Child 1]", captured_at: h(26), missing: "Is this a bill to pay, or already paid?", options: ["Bill to pay", "Already paid", "Not ours"], thread: null, status: "open", resolution: null },
  { id: "i3", kind: "decide", title: "Receipt [Restaurant] $64.00", origin: "Bulk drop (shoebox scan, 12 of 15 resolved)", origin_href: "/money/receipts", origin_label: "Money", requested_by: "Melissa", for_person: null, captured_at: h(50), missing: "Business or personal? If business, which entity?", options: ["Personal", "Veil Labs", "SHVR", "Et Al"], thread: null, status: "open", resolution: null },
  { id: "i4", kind: "ask_thread", title: "\"add the thing from the orthodontist\"", origin: "Ask, 2 days ago", origin_href: "/ask", origin_label: "Ask", requested_by: "Ryan", for_person: null, captured_at: h(49), missing: "Is this a document, an appointment or a bill?", options: ["File a document", "Add an appointment", "Add a bill", "Something else"], thread: [{ at: h(49), who: "you", text: "add the thing from the orthodontist" }, { at: h(49), who: "assistant", text: "Is this a document, an appointment or a bill? And which child?" }], status: "open", resolution: null },
  { id: "i5", kind: "identify", title: "Scan 2026-10-16 (3 pages, no header)", origin: "Bulk drop", origin_href: "#", origin_label: "Finder", requested_by: "Melissa", for_person: null, captured_at: h(60), missing: "What is this? A statement, a policy, or something else?", options: ["Statement", "Policy", "Receipt", "Something else"], thread: null, status: "open", resolution: null },
  { id: "i6", kind: "file", title: "[Utility] bill PDF", origin: "Email attachment from [Utility]", origin_href: "#", origin_label: "Gmail", requested_by: "System", for_person: null, captured_at: h(70), missing: "File under Home or under Et Al (the rental)?", options: ["Home", "Et Al"], thread: null, status: "open", resolution: null },
  { id: "i7", kind: "identify", title: "Photo IMG_4468 (a serial plate)", origin: "Photo", origin_href: "#", origin_label: "Photos", requested_by: "Ryan", for_person: null, captured_at: h(72), missing: "Which device is this plate from?", options: ["[Laptop]", "[Router]", "Something else"], thread: null, status: "open", resolution: null },
  // Statements (sample): one matched, one that needs an account, with long names on purpose so the layout is tested against them.
  { id: "i8", kind: "file", title: "5b0956af-aa11-4c2e-9d3e-0123456789ab-6006 - 123456 WellsFargo.pdf", origin: "Bulk drop", origin_href: "#", origin_label: "Finder", requested_by: "Ryan", for_person: null, captured_at: h(5), missing: "Statement for Wells Fargo ····6006, 2026-09, balance $1930.00 (matched by the file name). File it?", options: ["Yes, file it", "Not quite"], thread: null, status: "open", resolution: null, file_path: "sample/statement-1.pdf", read_at: h(4), read_result: { kind: "statement", statement_name: "2026-09 Wells Fargo ····6006 statement", statement_period: "2026-09", home: "Organized/Personal/Documents/Finance/2026/Statements/wells-fargo-cash-back-visa-signature-car-6918/", plan: [{ t: "file", text: "Will be named 2026-09 Wells Fargo ····6006 statement; a copy is placed in the account's statements folder (shown below)" }, { t: "link", text: "Money › Wells Fargo ····6006: 2026-09 is ticked off" }] } as unknown as InboxItem["read_result"] },
  { id: "i9", kind: "file", title: "ab5761cd-9999-4e2e-8f3e-0123456789ab-2222 - 987654 WellsFargo.pdf", origin: "Bulk drop", origin_href: "#", origin_label: "Finder", requested_by: "Ryan", for_person: null, captured_at: h(6), missing: "Not filed: no account number was found on the page, and the file name matches none of your accounts. Statement 2026-08, balance $3362.75. Which account is it for?", options: ["Chase ····5521", "Amex ····1004", "Mercury ····8802", "Something else"], thread: null, status: "open", resolution: null, file_path: "sample/statement-2.pdf", read_at: h(5), read_result: { kind: "statement", statement_period: "2026-08", home: "Organized/Personal/Documents/Finance/2026/Statements/", plan: [{ t: "file", text: "Will be named 2026-08 statement; a copy is placed in the statements folder (shown below)" }, { t: "link", text: "Not linked to an account until you say which" }] } as unknown as InboxItem["read_result"] },
];

export async function getInboxItems(): Promise<InboxItem[]> {
  if (!hasSupabaseEnv()) return sampleInbox;
  const sb = await createClient();
  // A freshly uploaded file is not shown until it has been read (so a tap can never beat the reading);
  // after FRESH_MS it is shown regardless, so a failed read can never hide a document.
  const { data } = await sb.from("inbox_items").select("*").eq("status", "open").or(`file_path.is.null,read_at.not.is.null,captured_at.lt.${new Date(Date.now() - FRESH_MS).toISOString()}`).order("captured_at", { ascending: true });
  return (data as InboxItem[]) ?? [];
}

export const FRESH_MS = 3 * 60_000;

// "Paid with" on open receipt cards: the cards the household uses, and a suggestion only when this person's last three receipts
// from the same vendor agree on one card. It pre-fills a choice; the person still taps.
export type PaidWithContext = { known: string[]; suggestions: Record<string, { card: string; reason: string }> };
export async function getPaidWithContext(items: InboxItem[]): Promise<PaidWithContext> {
  if (!hasSupabaseEnv()) return { known: ["Cash"], suggestions: {} };
  const sb = await createClient();
  const [{ data: rc }, { data: accts }] = await Promise.all([
    sb.from("receipts").select("merchant,card,uploaded_by,created_at").not("card", "is", null).order("created_at", { ascending: false }).limit(800),
    sb.from("accounts").select("institution,last4,kind,retired_at"),
  ]);
  const history: CardHistory[] = (rc ?? []).map((r) => ({ card: r.card as string, person: (r.uploaded_by as string | null) ?? null, vendorKey: normalizeVendor(r.merchant as string), at: String(r.created_at) }));
  const known = Array.from(new Set([...(accts ?? []).filter((a) => !a.retired_at && a.kind !== "checking" && a.kind !== "savings").map((a) => `${a.institution} ${a.last4}`), ...history.map((h) => h.card).filter((c): c is string => !!c && c !== CASH), CASH]));
  const suggestions: PaidWithContext["suggestions"] = {};
  for (const it of items) {
    const rr = it.read_result as DestRead | null;
    if (!isFiledByCard(rr)) continue;
    const s = suggestCard(history, normalizeVendor(rr?.vendor), it.created_by ?? null);
    if (s) suggestions[it.id] = { card: s.card, reason: suggestionReason(s, String(rr?.vendor)) };
  }
  return { known, suggestions };
}

// Decided: items answered in the last 30 days, newest first, as one line each. They stay on record; this is only the view.
export type DecidedItem = { read: Record<string, unknown> | null; amend_block: string | null; id: string; title: string; resolution: string | null; resolved_at: string | null; resolved_by: string | null; filed: Record<string, unknown> | null; file_path: string | null; kind: string | null; folder_note: string | null };
export async function getDecidedItems(days = 30): Promise<DecidedItem[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("inbox_items").select("id,title,resolution,resolved_at,resolved_by,filed,file_path,read_result,copied_path,copy_error").eq("status", "resolved").gte("resolved_at", new Date(Date.now() - days * 86_400_000).toISOString()).order("resolved_at", { ascending: false }).limit(300);
  const rows = data ?? [];
  const rids = rows.map((r) => (r.filed as { receipt_id?: string } | null)?.receipt_id).filter((x): x is string => !!x);
  const { data: rcs } = rids.length ? await sb.from("receipts").select("id,card,transaction_id").in("id", rids) : { data: [] as { id: string; card: string | null }[] };
  const cardOf = new Map((rcs ?? []).map((r) => [r.id as string, r.card as string | null]));
  const txOf = new Map((rcs ?? []).map((r) => [r.id as string, (r as { transaction_id?: string | null }).transaction_id ?? null]));
  return rows.map((r) => {
    const rid = (r.filed as { receipt_id?: string } | null)?.receipt_id;
    const isStatement = (r.read_result as { kind?: string } | null)?.kind === "statement";
    return { read: (r.read_result as Record<string, unknown> | null) ?? null, amend_block: amendBlock({ copied_path: r.copied_path as string | null, filed: r.filed as Record<string, unknown> | null, kind: (r.read_result as { kind?: string } | null)?.kind ?? null, transaction_id: rid ? txOf.get(rid) ?? null : null }), id: r.id, title: r.title, resolution: r.resolution, resolved_at: r.resolved_at, resolved_by: r.resolved_by, filed: r.filed, file_path: r.file_path, kind: (r.read_result as { kind?: string } | null)?.kind ?? null,
      folder_note: r.file_path && !isStatement ? copyState({ copied_path: r.copied_path, copy_error: r.copy_error, receipt_card: rid ? cardOf.get(rid) ?? null : null, is_receipt: !!rid }) : null };
  });
}

// Uploaded files still being read: not listed yet, but the page reads them and tells the person.
export async function getPendingReadIds(): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("inbox_items").select("id").eq("status", "open").not("file_path", "is", null).is("read_at", null).gte("captured_at", new Date(Date.now() - FRESH_MS).toISOString());
  return (data ?? []).map((r) => r.id as string);
}

export async function getInboxCounts(): Promise<{ open: number; resolved_this_week: number }> {
  if (!hasSupabaseEnv()) return { open: sampleInbox.length, resolved_this_week: 12 };
  const sb = await createClient();
  const [{ count: open }, { count: resolved }] = await Promise.all([
    sb.from("inbox_items").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb.from("inbox_items").select("id", { count: "exact", head: true }).eq("status", "resolved").gte("captured_at", h(24 * 7)),
  ]);
  return { open: open ?? 0, resolved_this_week: resolved ?? 0 };
}
