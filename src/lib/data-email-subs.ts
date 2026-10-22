import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Mailing lists found in the person's mailbox by scripts/email-subscriptions.mjs (table email_subscriptions, migrations 0016 and 0017).
// Not the same thing as Money › Subscriptions, which tracks paid recurring charges.
// The list never reads unsubscribe links (they can carry a personal token). Only rows that need the person to finish (getFinishLinks) do.
export type EmailSubStatus = "active" | "requested" | "done" | "needs_tap" | "open_link" | "failed" | "stopped";
export type EmailSub = {
  id: string; sender_name: string | null; address: string | null; domain: string | null;
  method: "one_click" | "mailto" | "link" | "none"; message_count: number; first_seen: string | null; last_seen: string | null;
  status: EmailSubStatus; status_note: string | null; requested_at: string | null; completed_at: string | null; messages_since_unsub: number;
};

const COLS = "id,sender_name,address,domain,method,message_count,first_seen,last_seen,status,status_note,requested_at,completed_at,messages_since_unsub";

const sampleSubs: EmailSub[] = [
  { id: "00000000-0000-4000-8000-000000000001", sender_name: "[Newsletter A]", address: "news@[sender-a].example", domain: "[sender-a].example", method: "one_click", message_count: 42, first_seen: "2025-11-02", last_seen: "2026-10-20", status: "active", status_note: null, requested_at: null, completed_at: null, messages_since_unsub: 0 },
  { id: "00000000-0000-4000-8000-000000000002", sender_name: "[Store B]", address: "deals@[store-b].example", domain: "[store-b].example", method: "one_click", message_count: 17, first_seen: "2026-01-10", last_seen: "2026-09-30", status: "active", status_note: null, requested_at: null, completed_at: null, messages_since_unsub: 0 },
  { id: "00000000-0000-4000-8000-000000000003", sender_name: "[Magazine C]", address: "hello@[magazine-c].example", domain: "[magazine-c].example", method: "mailto", message_count: 79, first_seen: "2025-10-30", last_seen: "2026-01-06", status: "active", status_note: null, requested_at: null, completed_at: null, messages_since_unsub: 0 },
];

export async function getEmailSubs(): Promise<EmailSub[]> {
  if (!hasSupabaseEnv()) return sampleSubs;
  const sb = await createClient();
  const { data } = await sb.from("email_subscriptions").select(COLS).is("deleted_at", null).order("last_seen", { ascending: false }).limit(2000);
  return (data as EmailSub[]) ?? [];
}

// When the scanner last ran (its health line in system_status).
export async function getEmailSubsScan(): Promise<{ at: string | null; state: string | null }> {
  if (!hasSupabaseEnv()) return { at: null, state: null };
  const sb = await createClient();
  const { data } = await sb.from("system_status").select("state,updated_at").eq("key", "email_subscriptions").maybeSingle();
  return { at: data?.updated_at ?? null, state: data?.state ?? null };
}

// The unsubscribe agent on the Mac mini checks in through system_status (key email_unsubscriber) every run.
// The button stays off unless it has checked in within the last hour, so a tap can never queue a request nothing will process.
export async function getUnsubscribeAgentReady(): Promise<boolean> {
  if (!hasSupabaseEnv()) return true;                                  // sample mode: demo the whole flow
  const sb = await createClient();
  const { data } = await sb.from("system_status").select("state,updated_at").eq("key", "email_unsubscriber").maybeSingle();
  return !!data?.updated_at && data.state !== "error" && Date.now() - Date.parse(data.updated_at) < 3600_000;
}

// Links for rows waiting on the person (open_link, needs_tap) only. Header-sourced, so anything but a plain https page or a mailto: is dropped.
export type FinishLinks = { open?: string; mail?: string };
const safeHttps = (v: unknown) => { try { const u = new URL(String(v)); return u.protocol === "https:" && !u.username && !u.password && String(v).length <= 2048 ? u.toString() : undefined; } catch { return undefined; } };
const safeMailto = (v: unknown) => { try { const u = new URL(String(v)); return u.protocol === "mailto:" && String(v).length <= 1024 && /^[^\s<>"]+@[^\s<>"]+$/.test(decodeURIComponent(u.pathname)) ? u.toString() : undefined; } catch { return undefined; } };
export async function getFinishLinks(ids: string[]): Promise<Record<string, FinishLinks>> {
  if (!ids.length) return {};
  if (!hasSupabaseEnv()) return {};
  const sb = await createClient();
  const { data } = await sb.from("email_subscriptions").select("id,status,unsub_http,unsub_mailto").in("id", ids).in("status", ["open_link", "needs_tap"]);
  const out: Record<string, FinishLinks> = {};
  for (const r of data ?? []) out[r.id] = { open: r.status === "open_link" ? safeHttps(r.unsub_http) : undefined, mail: r.status === "needs_tap" ? safeMailto(r.unsub_mailto) : undefined };
  return out;
}
