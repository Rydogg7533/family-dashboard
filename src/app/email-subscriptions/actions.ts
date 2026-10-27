"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// The person ticks senders and confirms. This ONLY marks them 'requested' (and says who asked). Sending the unsubscribe requests
// and reporting the result is done by the Mac mini agent; the database lets the app set nothing but active/requested
// (row-level security, migration 0016), so this page can never claim an unsubscribe that did not happen.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanIds = (ids: unknown) => (Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 200) : []);

async function who() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { sb, user, name: prof?.display_name ?? user.email ?? "member" };
}

export async function requestUnsubscribe(ids: string[]) {
  const list = cleanIds(ids);
  if (!list.length) return { ok: false as const, error: "Pick at least one sender." };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true, count: list.length };
  const me = await who();
  if (!me) return { ok: false as const, error: "Sign in again." };
  const now = new Date().toISOString();
  const { data, error } = await me.sb.from("email_subscriptions")
    .update({ status: "requested", requested_at: now, requested_by: me.user.id, updated_at: now })
    .in("id", list).eq("status", "active").eq("person", me.user.id).select("id,sender_name,address");
  if (error) return { ok: false as const, error: "Could not save the request." };
  if (!data?.length) return { ok: false as const, error: "Nothing changed. Those senders may already be requested." };
  const names = data.slice(0, 3).map((r) => r.sender_name || r.address).join(", ");
  await me.sb.from("activity_log").insert({ actor: me.name, action: "email_unsubscribe_requested", subject: `${me.name} asked to unsubscribe from ${data.length} sender${data.length === 1 ? "" : "s"}: ${names}${data.length > 3 ? " and more" : ""}`, ref: data[0].id, undoable: false }).then(() => {}, () => {});
  return { ok: true as const, count: data.length };
}

// Changing your mind is possible only until the Mac mini has picked the request up (status is still 'requested').
export async function cancelUnsubscribeRequest(ids: string[]) {
  const list = cleanIds(ids);
  if (!list.length) return { ok: false as const, error: "Nothing to cancel." };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true, count: list.length };
  const me = await who();
  if (!me) return { ok: false as const, error: "Sign in again." };
  const { data, error } = await me.sb.from("email_subscriptions")
    .update({ status: "active", requested_at: null, requested_by: null, updated_at: new Date().toISOString() })
    .in("id", list).eq("status", "requested").eq("person", me.user.id).select("id");
  if (error) return { ok: false as const, error: "Could not cancel." };
  if (!data?.length) return { ok: false as const, error: "Too late: the Mac mini has already started on that one." };
  await me.sb.from("activity_log").insert({ actor: me.name, action: "email_unsubscribe_cancelled", subject: `${me.name} cancelled ${data.length} unsubscribe request${data.length === 1 ? "" : "s"}`, ref: data[0].id, undoable: false }).then(() => {}, () => {});
  return { ok: true as const, count: data.length };
}

// "I know this sender": the agent refused to act because Gmail could not verify the sender (status 'check'). The person's say-so is
// recorded (trusted_at/by) and the row is requested again; the agent then proceeds. Only from 'check', only your own rows.
export async function trustAndRequest(ids: string[]) {
  const list = cleanIds(ids);
  if (!list.length) return { ok: false as const, error: "Nothing to do." };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true, count: list.length };
  const me = await who();
  if (!me) return { ok: false as const, error: "Sign in again." };
  const now = new Date().toISOString();
  const { data, error } = await me.sb.from("email_subscriptions")
    .update({ status: "requested", trusted_at: now, trusted_by: me.user.id, requested_at: now, requested_by: me.user.id, updated_at: now })
    .in("id", list).eq("status", "check").eq("person", me.user.id).select("id,sender_name,address");
  if (error) return { ok: false as const, error: "Could not save that." };
  if (!data?.length) return { ok: false as const, error: "Nothing changed." };
  await me.sb.from("activity_log").insert({ actor: me.name, action: "email_sender_trusted", subject: `${me.name} said they know ${data.map((r) => r.sender_name || r.address).slice(0, 3).join(", ")} and asked to unsubscribe anyway`.slice(0, 200), ref: data[0].id, undoable: false }).then(() => {}, () => {});
  return { ok: true as const, count: data.length };
}

// "Try again": a row that was handed to the person (needs_tap, open_link, failed, check) goes back to the list so it can be ticked again.
export async function retryLater(ids: string[]) {
  const list = cleanIds(ids);
  if (!list.length) return { ok: false as const, error: "Nothing to do." };
  if (!hasSupabaseEnv()) return { ok: true as const, sample: true, count: list.length };
  const me = await who();
  if (!me) return { ok: false as const, error: "Sign in again." };
  const { data, error } = await me.sb.from("email_subscriptions")
    .update({ status: "active", requested_at: null, requested_by: null, updated_at: new Date().toISOString() })
    .in("id", list).in("status", ["needs_tap", "open_link", "failed", "check"]).eq("person", me.user.id).select("id");
  if (error) return { ok: false as const, error: "Could not put that back." };
  if (!data?.length) return { ok: false as const, error: "Nothing changed." };
  return { ok: true as const, count: data.length };
}
