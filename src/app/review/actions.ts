"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Confirming the week writes one log row and nothing else. The sections above it are settled by their own
// actions (setTaskStatus, the subscription answer); this is the record that someone looked, with the count
// of what they left open. It is not a lock: anything still open stays on the list.
export async function confirmWeek(open: number) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const who = me?.display_name ?? user.email ?? "member";
  const subject = open ? `${who} confirmed the week with ${open} item${open === 1 ? "" : "s"} still open` : `${who} confirmed the week`;
  const { error } = await sb.from("activity_log").insert({ actor: who, action: "week_confirmed", subject, undoable: false });
  if (error) return { ok: false, error: "Could not record it." };
  revalidatePath("/review"); revalidatePath("/");
  return { ok: true };
}
