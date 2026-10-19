"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type PushSubJSON = { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null };

// Saves this device's push subscription for the signed-in person (sample mode: logs only).
export async function saveSubscription(sub: PushSubJSON, deviceLabel: string) {
  if (!hasSupabaseEnv()) { console.log("[sample] push subscription", sub.endpoint.slice(0, 40), deviceLabel); return { ok: true, sample: true }; }
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await sb.from("push_subscriptions").upsert({ person: user.id, endpoint: sub.endpoint, keys: sub.keys, device_label: deviceLabel, last_used_at: new Date().toISOString() }, { onConflict: "endpoint" });
  return { ok: !error, error: error?.message };
}

// Queues a test notification for the Mac mini sender (sample mode: logs only).
export async function sendTest(who: string) {
  const row = { type: "test", channel: "push", title: "Test from the Family Dashboard", body: `${who} asked for a test · from Settings`, url: "/settings/notifications", tag: `test-${new Date().toISOString().slice(0, 16)}`, status: "queued" };
  if (!hasSupabaseEnv()) { console.log("[sample] notification queued", row); return { ok: true, sample: true, queuedAt: new Date().toISOString() }; }
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await sb.from("notifications").insert({ ...row, person: user.id });
  if (!error) await sb.from("activity_log").insert({ actor: who, action: "notification_test", subject: "Test notification queued", undoable: false }).then(() => {}, () => {});
  return { ok: !error, error: error?.message, queuedAt: new Date().toISOString() };
}
