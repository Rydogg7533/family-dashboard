import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";
import { getOpenTasks, getDisplayName } from "@/lib/data";
import { householdTz } from "@/lib/google-calendar";
import { splitTasks } from "@/lib/tasks-view";
import { buildQueue, countNew, type QueueInboxItem } from "@/lib/today-queue";

// Small counts for the bottom bar: Inbox items handed to the signed-in person, and queue items new since the person
// last opened Today (D23: the one badge, same number as the app icon). Never cached.
export const dynamic = "force-dynamic";
export async function GET() {
  const empty = NextResponse.json({ inboxHanded: 0, todayNew: 0 }, { headers: { "Cache-Control": "no-store" } });
  if (!hasSupabaseEnv()) return empty;
  const user = await getRequestUser();
  if (!user) return empty;
  const sb = await createClient();
  const [{ count }, { data: items }, { data: prof }, tasks, name, tz] = await Promise.all([
    sb.from("inbox_items").select("id", { count: "exact", head: true }).eq("status", "open").eq("assigned_to", user.id),
    sb.from("inbox_items").select("id,title,missing,captured_at,assigned_to,for_person,requested_by").eq("status", "open").limit(50),
    sb.from("profiles").select("today_seen_at").eq("id", user.id).maybeSingle(),
    getOpenTasks(), getDisplayName(), householdTz(),
  ]);
  const queue = buildQueue(splitTasks(tasks, user.id).mine, (items ?? []) as QueueInboxItem[], { me: user.id, myName: name, tz, seenAt: prof?.today_seen_at ?? null });
  return NextResponse.json({ inboxHanded: count ?? 0, todayNew: countNew(queue) }, { headers: { "Cache-Control": "no-store" } });
}
