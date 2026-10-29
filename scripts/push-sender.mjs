#!/usr/bin/env node
// Mac mini → phones: delivers queued rows of public.notifications as web push. One pass per run; launchd runs it every 30 seconds.
//   node scripts/push-sender.mjs --dry     # look only: say what it would send, send and change nothing
//   node scripts/push-sender.mjs           # what launchd runs
// Rules (F23/F24, see scripts/push-sender.md): the same tag is never pushed twice in 24 h (except type=message: every new line in a
// conversation pushes, and the shared thread tag makes the newest one replace the banner); quiet hours hold everything except
// test, safety and system rows; every send is a row with sent_at; a retracted item sends {close: tag} to close the banner.
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT and the service key come from ~/_secrets_local_only/family-dashboard.env.
// Nothing is deleted except a push subscription the push service itself reports gone (404/410: the device unsubscribed).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import webPush from "web-push";

const DRY = process.argv.includes("--dry");
const TZ = "America/Denver";
// Quiet hours live in each phone's browser storage for now (not the database), so the sender uses the household default.
const QUIET = { start: "21:00", end: "07:00" };
const BYPASS = new Set(["test", "safety", "system", "sitter"]); // a sitter prompt is time-critical: it is not held for quiet hours
const HOLD_LIMIT_MS = 24 * 3600e3; // a row for a person with no subscribed device waits this long, then is marked failed

const env = {};
try { for (const line of readFileSync(join(homedir(), "_secrets_local_only", "family-dashboard.env"), "utf8").split("\n")) { const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* reported below */ }
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) { console.error("STOP: env file is missing the Supabase service key or the VAPID keys."); process.exit(1); }
webPush.setVapidDetails(env.VAPID_SUBJECT || "mailto:admin@shvr.co", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(method, path, body, extra = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const now = () => new Date().toISOString();
const q = (s) => encodeURIComponent(s);

const minutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
function inQuiet(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const t = minutes(parts), s = minutes(QUIET.start), e = minutes(QUIET.end);
  return s <= e ? t >= s && t < e : t >= s || t < e; // the window wraps midnight
}

async function push(sub, payload) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 3600 }); return { ok: true }; }
    catch (e) { last = e; if (e.statusCode === 404 || e.statusCode === 410) return { gone: true }; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
  }
  return { error: `${last?.statusCode ?? ""} ${last?.body || last?.message || "send failed"}`.trim().slice(0, 300) };
}

const stats = { sent: 0, held: 0, deduped: 0, failed: 0, retracted: 0, gone: 0 };
const subsFor = new Map();
async function subs(person) { if (!subsFor.has(person)) subsFor.set(person, await rest("GET", `push_subscriptions?person=eq.${person}&select=id,endpoint,keys`)); return subsFor.get(person); }

// D23 (2026-10-28): the app icon badge is the number of queue items the person has not seen since they last opened
// Today: open tasks for them (or for both) and open Inbox items waiting on them, created after profiles.today_seen_at.
// A rough count is fine; the app corrects it on open. null = could not compute, send no badge.
async function unseenCount(person) {
  try {
    const [prof] = await rest("GET", `profiles?id=eq.${person}&select=today_seen_at,display_name`);
    const since = prof?.today_seen_at || "1970-01-01";
    const tasks = await rest("GET", `tasks?status=eq.open&kind=neq.fyi&created_at=gt.${encodeURIComponent(since)}&or=(person.eq.${person},person.is.null,audience.eq.both)&select=id`);
    const inbox = await rest("GET", `inbox_items?status=eq.open&captured_at=gt.${encodeURIComponent(since)}&or=(assigned_to.eq.${person},assigned_to.is.null)&select=id,for_person`);
    const name = String(prof?.display_name || "").toLowerCase();
    const mine = inbox.filter((i) => !i.for_person || !name || String(i.for_person).toLowerCase() === name);
    return tasks.length + mine.length;
  } catch { return null; }
}

async function main() {
  const rows = await rest("GET", "notifications?status=eq.queued&channel=eq.push&order=queued_at.asc&limit=50&select=id,person,type,title,body,url,tag,queued_at");
  for (const n of rows) {
    if (!BYPASS.has(n.type) && inQuiet()) { stats.held++; continue; }
    if (n.tag && n.type !== "test" && n.type !== "message") {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString();
      const dup = await rest("GET", `notifications?person=eq.${n.person}&tag=eq.${q(n.tag)}&status=eq.sent&sent_at=gte.${since}&id=neq.${n.id}&select=id&limit=1`);
      if (dup.length) { stats.deduped++; if (!DRY) await rest("PATCH", `notifications?id=eq.${n.id}`, { status: "sent", sent_at: now(), error: "deduped" }, { Prefer: "return=minimal" }); continue; }
    }
    const list = await subs(n.person);
    if (!list.length) {
      if (Date.now() - Date.parse(n.queued_at) > HOLD_LIMIT_MS) { stats.failed++; if (!DRY) await rest("PATCH", `notifications?id=eq.${n.id}`, { status: "failed", error: "no subscribed device for 24 h" }, { Prefer: "return=minimal" }); }
      else stats.held++;
      continue;
    }
    if (DRY) { console.log(`would send "${n.title}" to ${list.length} device(s)`); stats.sent++; continue; }
    const badge = await unseenCount(n.person);
    let ok = 0, err = null;
    for (const s of list) {
      const r = await push(s, { title: n.title, body: n.body, url: n.url || "/", tag: n.tag || undefined, ...(badge == null ? {} : { badge }) });
      if (r.ok) { ok++; await rest("PATCH", `push_subscriptions?id=eq.${s.id}`, { last_used_at: now() }, { Prefer: "return=minimal" }); }
      else if (r.gone) { stats.gone++; await rest("DELETE", `push_subscriptions?id=eq.${s.id}`, undefined, { Prefer: "return=minimal" }); subsFor.delete(n.person); }
      else err = r.error;
    }
    if (ok) { stats.sent++; await rest("PATCH", `notifications?id=eq.${n.id}`, { status: "sent", sent_at: now(), error: err }, { Prefer: "return=minimal" }); }
    else { stats.failed++; await rest("PATCH", `notifications?id=eq.${n.id}`, { status: "failed", error: err || "every device for this person has unsubscribed" }, { Prefer: "return=minimal" }); }
  }

  // F24: an item handled elsewhere closes its banner on every device.
  const gone = await rest("GET", "notifications?status=eq.retracted&sent_at=not.is.null&retract_pushed_at=is.null&limit=50&select=id,person,tag");
  for (const n of gone) {
    if (!n.tag) { if (!DRY) await rest("PATCH", `notifications?id=eq.${n.id}`, { retract_pushed_at: now() }, { Prefer: "return=minimal" }); continue; }
    if (DRY) { console.log(`would close "${n.tag}"`); stats.retracted++; continue; }
    for (const s of await subs(n.person)) await push(s, { close: n.tag });
    await rest("PATCH", `notifications?id=eq.${n.id}`, { retract_pushed_at: now() }, { Prefer: "return=minimal" });
    stats.retracted++;
  }

  const time = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date());
  const summary = `Push sender: sent ${stats.sent} · held ${stats.held} · failed ${stats.failed} · ${time}`;
  console.log(`${now()} ${summary}${stats.deduped ? ` · deduped ${stats.deduped}` : ""}${stats.retracted ? ` · closed ${stats.retracted}` : ""}${stats.gone ? ` · dropped ${stats.gone} dead device(s)` : ""}`);
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "push_sender", state: stats.failed ? "warn" : "ok", summary, value_num: null, updated_at: now() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
}
main().catch((e) => { console.error(`${now()} push-sender error: ${e.message}`); process.exit(1); });
