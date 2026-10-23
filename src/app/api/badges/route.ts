import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";

// Small counts for the bottom bar: Inbox items handed to the signed-in person. Never cached.
export const dynamic = "force-dynamic";
export async function GET() {
  const empty = NextResponse.json({ inboxHanded: 0 }, { headers: { "Cache-Control": "no-store" } });
  if (!hasSupabaseEnv()) return empty;
  const user = await getRequestUser();
  if (!user) return empty;
  const sb = await createClient();
  const { count } = await sb.from("inbox_items").select("id", { count: "exact", head: true }).eq("status", "open").eq("assigned_to", user.id);
  return NextResponse.json({ inboxHanded: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
