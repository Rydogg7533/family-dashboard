// Inbox (ongoing ingestion, F2 bulk drops, F4 unplaced Ask threads): items that need a person to identify,
// file or decide. Each item asks exactly what is missing and stays until resolved; nothing expires.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

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
  read_result?: { home?: string; plan?: ({ t: "file" | "link"; text: string } | string)[]; claim_plan?: string } | null;
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
