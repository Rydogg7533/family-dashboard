// Money › Statements: the owner-only list of uploaded statements and where each one stands. Falls back to a bracketed sample in preview.
// Reads only the shape the hub wrote back (account, month, whether the arithmetic ties, field names it could not find). Never statement text.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { AccountRow } from "@/lib/statement-match";

export type StatementStatus = "uploaded" | "reading" | "read" | "needs_account" | "failed";
export type StatementUpload = {
  id: string; original_name: string; status: StatementStatus; account_id: string | null; period: string | null;
  tie_ok: boolean | null; tie_note: string | null; missing: string[]; error: string | null; uploaded_at: string; read_at: string | null; local_copy: string | null;
};
export type StatementsView = { isOwner: boolean; accounts: AccountRow[]; uploads: StatementUpload[] };

const SAMPLE: StatementsView = {
  isOwner: true,
  accounts: [{ id: "sample-0000", institution: "[Bank]", last4: "0000" }],
  uploads: [
    { id: "s1", original_name: "[statement].pdf", status: "read", account_id: "sample-0000", period: "2026-10", tie_ok: true, tie_note: "Opening balance plus movements equals the closing balance.", missing: [], error: null, uploaded_at: new Date().toISOString(), read_at: new Date().toISOString(), local_copy: "Organized/[sample]" },
  ],
};

export async function getStatementsView(): Promise<StatementsView> {
  if (!hasSupabaseEnv()) return SAMPLE;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { isOwner: false, accounts: [], uploads: [] };
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "owner") return { isOwner: false, accounts: [], uploads: [] };
  const [accts, ups] = await Promise.all([
    sb.from("accounts").select("id,institution,last4,retired_at").order("institution"),
    sb.from("statement_uploads").select("id,original_name,status,account_id,period,tie_ok,tie_note,missing,error,uploaded_at,read_at,local_copy").order("uploaded_at", { ascending: false }).limit(60),
  ]);
  return { isOwner: true, accounts: ((accts.data ?? []) as AccountRow[]).filter((a) => !a.retired_at), uploads: (ups.data ?? []) as StatementUpload[] };
}
