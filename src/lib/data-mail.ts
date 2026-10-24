import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Mail (stage 1, read-only): copied from the person's own mailboxes by scripts/mail-sync.mjs (migration 0021).
export type MailRow = {
  id: string; account: string; folder: "inbox" | "draft"; from_name: string | null; from_addr: string | null; to_addrs: { name: string; addr: string }[];
  subject: string | null; snippet: string | null; sent_at: string | null; unread: boolean; has_files: boolean;
};
export type MailFull = MailRow & { cc_addrs: { name: string; addr: string }[]; body_text: string | null; attachments: { name: string; mime: string; size: number }[]; web_url: string | null; rfc_message_id: string | null };
export type MailAccount = { id: string; address: string; kind: "gmail" | "icloud" | "other"; last_sync_at: string | null; last_error: string | null };

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
