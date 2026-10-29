import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Mail (stage 1, read-only): copied from the person's own mailboxes by scripts/mail-sync.mjs (migration 0021).
export type MailRow = {
  id: string; account: string; folder: "inbox" | "draft"; from_name: string | null; from_addr: string | null; to_addrs: { name: string; addr: string }[];
  subject: string | null; snippet: string | null; sent_at: string | null; unread: boolean; has_files: boolean;
};
export type MailFull = MailRow & { cc_addrs: { name: string; addr: string }[]; body_text: string | null; attachments: { name: string; mime: string; size: number }[]; web_url: string | null; rfc_message_id: string | null };
export type MailAccount = { id: string; address: string; kind: "gmail" | "icloud" | "other"; last_sync_at: string | null; last_error: string | null };

// Whether a sync error is worth showing a person, and what to say. One rule, because there were two:
// Settings › Connections already waited an hour and used plain words, while this slice's Mail page printed
// `last_error` straight from the database the moment it appeared. So a dropped connection on the mini -- which
// the sync scripts retry by themselves -- put the literal string "fetch failed" in front of Melissa on her
// phone, under the words "could not be read", about a mailbox whose 668 messages were sitting there intact.
//
// Two rules, both from the Connections version:
//  - A single failed run is not news. mail-sync runs every five minutes and clears the error on its next
//    success, so nothing is said until an hour has passed with no successful sync.
//  - Never show an API string. Node reports every dropped connection as "fetch failed"; that is our plumbing
//    leaking, and it reads as data loss to anyone who is not the person who wrote it.
// The mail itself is never gone when this shows: what is here was synced before the trouble started, so the
// wording says the mailbox is not up to date, never that it cannot be read.
const HOUR = 60 * 60_000;
export function mailTrouble(a: Pick<MailAccount, "address" | "last_sync_at" | "last_error">, now = Date.now()):
  { text: string } | null {
  if (!a.last_error) return null;
  if (a.last_sync_at && now - Date.parse(a.last_sync_at) < HOUR) return null;
  const e = String(a.last_error);
  const why = /invalid_grant|revoked|expired|401|403|insufficient/i.test(e)
    ? "the sign-in has expired — sign in again on the Mac mini"
    : /retries|rate|429|timeout|ECONN|ENOTFOUND|fetch failed/i.test(e)
      ? "the mail service is not answering"
      : e.slice(0, 120);
  const when = a.last_sync_at
    ? `last updated ${new Date(a.last_sync_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : "it has not finished a first sync yet";
  return { text: `${a.address} is not up to date — ${why}. The mail below ${a.last_sync_at ? `was ${when}` : "is incomplete"}.` };
}

// Every mailbox the household has already connected — address and owner only, from the household_mailboxes
// view (0065). The Add a mailbox screen needs this because mail_accounts is own-rows-only: without it, one
// parent cannot see that the other already connected an address, and sets it up a second time under the
// wrong owner. Deliberately carries no counts, sync times or errors for other people's mailboxes.
export type HouseholdMailbox = { address: string; kind: string; owner: string | null; mine: boolean };
export async function getHouseholdMailboxes(): Promise<HouseholdMailbox[]> {
  if (!hasSupabaseEnv()) return [{ address: SAMPLE_ACCT, kind: "gmail", owner: "You", mine: true }];
  try {
    const sb = await createClient();
    const { data } = await sb.from("household_mailboxes").select("address,kind,owner,mine").order("address");
    return (data ?? []) as HouseholdMailbox[];
  } catch { return []; }
}

const SAMPLE_ACCT = "you@example.com";
export async function getMailAccounts(): Promise<MailAccount[]> {
  if (!hasSupabaseEnv()) return [{ id: "a1", address: SAMPLE_ACCT, kind: "gmail" as const, last_sync_at: new Date().toISOString(), last_error: null }];
  try { const sb = await createClient(); const { data } = await sb.from("mail_accounts").select("id,address,kind,last_sync_at,last_error").order("address"); return data ?? []; } catch { return []; }
}
export async function getMail(folder: "inbox" | "draft"): Promise<MailRow[]> {
  if (!hasSupabaseEnv()) {
    const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
    return folder === "draft" ? [{ id: "s3", account: SAMPLE_ACCT, folder, from_name: null, from_addr: SAMPLE_ACCT, to_addrs: [{ name: "Dana", addr: "dana@example.com" }], subject: "Re: Estimate for the fence", snippet: "Hi Dana, thanks for the quote. Can you do the 14th?", sent_at: h(3), unread: false, has_files: false }]
      : [{ id: "s1", account: SAMPLE_ACCT, folder, from_name: "Dana Reyes", from_addr: "dana@example.com", to_addrs: [], subject: "Estimate for the fence", snippet: "Attached is the estimate we talked about.", sent_at: h(5), unread: true, has_files: true }, { id: "s2", account: SAMPLE_ACCT, folder, from_name: "Orem Library", from_addr: "no-reply@orem.gov", to_addrs: [], subject: "Your hold is ready", snippet: "The book you requested is ready for pickup.", sent_at: h(30), unread: false, has_files: false }];
  }
  try {
    const sb = await createClient();
    const { data: accts } = await sb.from("mail_accounts").select("id,address");
    const name = new Map((accts ?? []).map((a) => [a.id, a.address]));
    const { data } = await sb.from("mail_messages").select("id,account_id,folder,from_name,from_addr,to_addrs,subject,snippet,sent_at,unread,attachments").eq("folder", folder).is("left_inbox_at", null).order("sent_at", { ascending: false, nullsFirst: false }).limit(300);
    return (data ?? []).map((r) => ({ id: r.id, account: name.get(r.account_id) ?? "", folder: r.folder, from_name: r.from_name, from_addr: r.from_addr, to_addrs: r.to_addrs ?? [], subject: r.subject, snippet: r.snippet, sent_at: r.sent_at, unread: r.unread, has_files: Array.isArray(r.attachments) && r.attachments.length > 0 }));
  } catch { return []; }
}
export async function getMailMessage(id: string): Promise<MailFull | null> {
  if (!hasSupabaseEnv()) { const all = [...(await getMail("inbox")), ...(await getMail("draft"))]; const m = all.find((x) => x.id === id); return m ? { ...m, cc_addrs: [], body_text: "Sample message body.\n\nThis is what a plain-text email looks like in the app.", attachments: m.has_files ? [{ name: "estimate.pdf", mime: "application/pdf", size: 48213 }] : [], web_url: "https://mail.google.com/", rfc_message_id: "sample@example.com" } : null; }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const sb = await createClient();
    const { data: r } = await sb.from("mail_messages").select("id,account_id,folder,from_name,from_addr,to_addrs,cc_addrs,subject,snippet,body_text,sent_at,unread,attachments,web_url,rfc_message_id").eq("id", id).maybeSingle();
    if (!r) return null;
    const { data: a } = await sb.from("mail_accounts").select("address").eq("id", r.account_id).maybeSingle();
    return { id: r.id, account: a?.address ?? "", folder: r.folder, from_name: r.from_name, from_addr: r.from_addr, to_addrs: r.to_addrs ?? [], cc_addrs: r.cc_addrs ?? [], subject: r.subject, snippet: r.snippet, body_text: r.body_text, sent_at: r.sent_at, unread: r.unread, has_files: (r.attachments ?? []).length > 0, attachments: r.attachments ?? [], web_url: r.web_url, rfc_message_id: r.rfc_message_id };
  } catch { return null; }
}

// Newsletters (decisions 2026-10-28 D14–D19): inbox messages whose sender is on the person's mailing lists
// (email_subscriptions), grouped by sender. Senders archived in the dashboard are left out here; the Inbox tab and
// Gmail are untouched. Reads the same copied rows as the Inbox; nothing else is fetched or stored.
export type NewsletterSender = {
  sub_id: string; name: string; address: string; status: string; archived: boolean; category: string | null;
  count: number; unread: number; latest: MailRow | null;
};
export async function getNewsletters(): Promise<{ senders: NewsletterSender[]; rows: MailRow[] }> {
  if (!hasSupabaseEnv()) {
    const rows = (await getMail("inbox")).filter((r) => r.from_addr === "no-reply@orem.gov");
    return { senders: [{ sub_id: "00000000-0000-4000-8000-000000000001", name: "Orem Library", address: "no-reply@orem.gov", status: "active", archived: false, category: "news", count: rows.length, unread: rows.filter((r) => r.unread).length, latest: rows[0] ?? null }], rows };
  }
  try {
    const sb = await createClient();
    const { data: subs } = await sb.from("email_subscriptions").select("id,sender_name,address,status,archived_at,category").is("deleted_at", null).not("address", "is", null);
    const byAddr = new Map((subs ?? []).map((s) => [String(s.address).toLowerCase(), s]));
    if (!byAddr.size) return { senders: [], rows: [] };
    const all = await getMail("inbox");
    const rows = all.filter((r) => r.from_addr && byAddr.has(r.from_addr.toLowerCase()));
    const groups = new Map<string, NewsletterSender>();
    for (const r of rows) {
      const s = byAddr.get(r.from_addr!.toLowerCase())!;
      const g = groups.get(s.id) ?? { sub_id: s.id, name: s.sender_name || r.from_name || s.address, address: s.address, status: s.status, archived: !!s.archived_at, category: s.category, count: 0, unread: 0, latest: null };
      g.count++; if (r.unread) g.unread++; if (!g.latest) g.latest = r;
      groups.set(s.id, g);
    }
    const senders = [...groups.values()].sort((a, b) => (b.latest?.sent_at ?? "").localeCompare(a.latest?.sent_at ?? ""));
    return { senders, rows };
  } catch { return { senders: [], rows: [] }; }
}

// For the open-message view: is this sender one of the person's mailing lists? Returns the subscription row the
// Archive / Unsubscribe buttons act on (D19), or null for ordinary mail.
export async function getSubscriptionForAddress(addr: string | null): Promise<{ id: string; name: string; status: string; archived: boolean; auth_ok: boolean | null; trusted: boolean } | null> {
  if (!addr) return null;
  if (!hasSupabaseEnv()) return addr === "no-reply@orem.gov" ? { id: "00000000-0000-4000-8000-000000000001", name: "Orem Library", status: "active", archived: false, auth_ok: true, trusted: false } : null;
  try {
    const sb = await createClient();
    const { data } = await sb.from("email_subscriptions").select("id,sender_name,address,status,archived_at,auth_ok,trusted_at").is("deleted_at", null).ilike("address", addr).limit(1).maybeSingle();
    return data ? { id: data.id, name: data.sender_name || data.address, status: data.status, archived: !!data.archived_at, auth_ok: data.auth_ok, trusted: !!data.trusted_at } : null;
  } catch { return null; }
}
