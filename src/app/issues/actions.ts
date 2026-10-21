"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type IssueInput = {
  text: string;
  severity: "blocks" | "annoying" | "cosmetic" | "idea";
  page: string;
  item_kind?: string | null;
  item_id?: string | null;
  user_agent?: string | null;
  viewport?: string | null;
  screenshots?: string[];
};

function appVersion() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "";
  return sha ? sha.slice(0, 7) : "dev";
}

export async function reportIssue(input: IssueInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const text = (input.text ?? "").trim();
  if (!text) return { ok: false, error: "Say what happened in a line." };
  if (!hasSupabaseEnv()) return { ok: true, id: "sample" };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await sb.from("profiles").select("display_name").eq("id", user.id).single();
  const { data, error } = await sb.from("issues").insert({
    reported_by: user.id,
    reporter_name: profile?.display_name ?? user.email ?? null,
    text: text.slice(0, 2000),
    severity: input.severity,
    page: input.page.slice(0, 300),
    item_kind: input.item_kind ?? null,
    item_id: input.item_id ?? null,
    app_version: appVersion(),
    user_agent: input.user_agent?.slice(0, 300) ?? null,
    viewport: input.viewport ?? null,
    screenshots: (input.screenshots ?? []).filter((x) => typeof x === "string" && x.startsWith(`${user.id}/`)).slice(0, 3),
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  await sb.from("activity_log").insert({ actor: profile?.display_name ?? "member", action: "issue_reported", subject: text.slice(0, 80), ref: data.id, undoable: false }).then(() => {}, () => {});
  return { ok: true, id: data.id };
}

export type IssueRow = {
  id: string; reporter_name: string | null; text: string; severity: string; page: string; item_kind: string | null;
  status: string; status_note: string | null; fixed_in: string | null; app_version: string | null; created_at: string; updated_at: string; screenshots?: string[] | null;
};

export async function listIssues(limit = 50): Promise<IssueRow[]> {
  if (!hasSupabaseEnv()) {
    const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
    return [
      { id: "s1", reporter_name: "Melissa", text: "Receipts page shows nothing for the Chase card", severity: "blocks", page: "/money/receipts", item_kind: null, status: "fixed", status_note: "A card with no transactions crashed the list.", fixed_in: "1.0.3", app_version: "1.0.2", created_at: h(50), updated_at: h(20) },
      { id: "s2", reporter_name: "Ryan", text: "Expected a question when the Sienna registration came due; nothing appeared", severity: "annoying", page: "/vehicles", item_kind: "vehicle", status: "open", status_note: null, fixed_in: null, app_version: "1.0.3", created_at: h(6), updated_at: h(6) },
    ];
  }
  const sb = await createClient();
  const { data } = await sb.from("issues").select("id, reporter_name, text, severity, page, item_kind, status, status_note, fixed_in, app_version, created_at, updated_at, screenshots").order("created_at", { ascending: false }).limit(limit);
  return (data as IssueRow[]) ?? [];
}
