"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { googleCalAccount, type CalRole } from "@/lib/google-calendar";

// Tick or untick one calendar, for the person who is signed in (RLS agrees). Nothing is deleted:
// a calendar the person turns off keeps its row with shown = false.
export async function setCalendarShown(calendarId: string, shown: boolean, name?: string, color?: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const { error } = await sb.from("calendar_choices").upsert({
    person: user.id, account: googleCalAccount(), calendar_id: calendarId, shown,
    name: name ?? null, color: color ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: "person,account,calendar_id" });
  if (error) return { ok: false, error: error.message };
  for (const p of ["/calendar", "/day", "/places"]) revalidatePath(p);
  return { ok: true };
}

export async function setCalendarRole(calendarId: string, role: CalRole): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  if (!["show", "suggestions", "default"].includes(role)) return { ok: false, error: "Unknown role." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const account = googleCalAccount();
  // One default at a time: the old default drops back to plain "show".
  if (role === "default") await sb.from("calendar_choices").update({ role: "show" }).eq("person", user.id).eq("account", account).eq("role", "default").then(() => {}, () => {});
  const { error } = await sb.from("calendar_choices").update({ role, updated_at: new Date().toISOString() }).eq("person", user.id).eq("account", account).eq("calendar_id", calendarId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}
