"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { forgetHouseholdTz } from "@/lib/google-calendar";

// The household's name and clock. The time zone decides what "today" means everywhere: the calendar,
// a sitter's leave-by time, the money routine's month. Owners only (RLS agrees).
export async function saveHousehold(name: string, tz: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  const n = name.replace(/\s+/g, " ").trim().slice(0, 60);
  const z = tz.trim().slice(0, 60);
  if (!z) return { ok: false, error: "Pick a time zone." };
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); } catch { return { ok: false, error: `${z} is not a time zone this app knows.` }; }
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const { error } = await sb.from("household").update({ name: n || null, tz: z }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  forgetHouseholdTz();   // this instance; others pick it up within the minute
  await sb.from("activity_log").insert({ actor: user.email ?? "member", action: "household_saved", subject: `Time zone ${z}`, ref: "household", undoable: false }).then(() => {}, () => {});
  for (const p of ["/settings/household", "/calendar", "/day", "/money/routine", "/"]) revalidatePath(p);
  return { ok: true };
}
