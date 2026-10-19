# Push sender (runs on the Mac mini)

The dashboard never sends a notification itself. Pages and the agent insert rows into
`public.notifications` with `status = 'queued'`; this small Node script on the Mac mini
delivers them with web push and marks them sent. One process, polled every 30 seconds,
started by launchd like the mirror job.

## Keys

- Generate once: `npx web-push generate-vapid-keys`.
- Public key → Vercel env `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the browser needs it to subscribe).
- Private key → `~/_secrets_local_only/vapid.json` on the Mac mini (`{ "publicKey": "...", "privateKey": "...", "subject": "mailto:admin@shvr.co" }`). Never in the repo, never in a cloud-synced folder.
- Supabase service-role key → `~/_secrets_local_only/supabase-service.json`. The sender uses the service role so RLS does not apply to it.

## Install

```
mkdir -p ~/Code/push-sender && cd ~/Code/push-sender
npm init -y && npm install web-push @supabase/supabase-js
```

## What it does (every 30 s)

1. Read `person_settings.notification_prefs` for each person (quiet hours, matrix).
2. Select up to 50 rows from `notifications` where `status = 'queued'`, oldest first.
3. For each row:
   - **Channel**: only `push` rows are sent here. `messages` rows are handed to the Messages
     bridge (F17); `today` rows are left queued with `channel = 'today'` for the Today page
     and marked `sent` at once (nothing to deliver).
   - **Dedupe by tag**: if a `sent` row exists for the same `person` and `tag` in the last
     24 hours, mark this one `sent` with `error = 'deduped'` (the same fact is never pushed twice).
   - **Quiet hours**: if now is inside the person's quiet window and `type` is not `safety`
     or `system`, leave it queued (it goes out at the end of quiet hours). Morning summaries
     are queued by the agent at the person's `morningTime`, so they never hit quiet hours.
   - **Send**: `webPush.sendNotification(subscription, JSON.stringify({ title, body, url, tag }))`
     to every row in `push_subscriptions` for that person. A 404 or 410 from the push service
     deletes that subscription row (the device unsubscribed). Any other error after 3 attempts
     marks the row `failed` with the message; three failures in a row for one person become a
     `system_status` warn row (`push_sender`) so Today shows it.
   - Mark `status = 'sent', sent_at = now()`, update `push_subscriptions.last_used_at`.
4. Write a heartbeat to `system_status` (`push_sender`, ok, "Sent 3 · queued 0 · 8:05 am").

## Minimal implementation sketch

```js
import webPush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const vapid = JSON.parse(readFileSync(`${process.env.HOME}/_secrets_local_only/vapid.json`));
const svc = JSON.parse(readFileSync(`${process.env.HOME}/_secrets_local_only/supabase-service.json`));
webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
const sb = createClient(svc.url, svc.serviceRoleKey);

const inQuiet = (prefs, now = new Date()) => { /* compare HH:MM of now (America/Denver) with prefs.quietStart..quietEnd, wrapping midnight */ };

async function tick() {
  const { data: rows } = await sb.from("notifications").select("*").eq("status", "queued").order("queued_at").limit(50);
  for (const n of rows ?? []) {
    if (n.channel !== "push") { await sb.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", n.id); continue; }
    const { data: ps } = await sb.from("person_settings").select("notification_prefs").eq("person", n.person).maybeSingle();
    const prefs = ps?.notification_prefs ?? {};
    if (!["safety", "system"].includes(n.type) && inQuiet(prefs)) continue;
    if (n.tag) {
      const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("person", n.person).eq("tag", n.tag).eq("status", "sent").gte("sent_at", new Date(Date.now() - 86400e3).toISOString());
      if (count) { await sb.from("notifications").update({ status: "sent", sent_at: new Date().toISOString(), error: "deduped" }).eq("id", n.id); continue; }
    }
    const { data: subs } = await sb.from("push_subscriptions").select("*").eq("person", n.person);
    let ok = 0, err = null;
    for (const s of subs ?? []) {
      try { await webPush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag })); ok++; await sb.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id); }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); else err = e.message; }
    }
    await sb.from("notifications").update(ok || !err ? { status: "sent", sent_at: new Date().toISOString() } : { status: "failed", error: err }).eq("id", n.id);
  }
  await sb.from("system_status").upsert({ key: "push_sender", state: "ok", summary: `Push sender OK ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, updated_at: new Date().toISOString() });
}
setInterval(() => tick().catch(console.error), 30_000); tick();
```

## launchd

`~/Library/LaunchAgents/co.shvr.push-sender.plist` with `KeepAlive true`, `RunAtLoad true`,
`ProgramArguments` = `/usr/local/bin/node ~/Code/push-sender/index.mjs`, logs to
`~/Library/Logs/push-sender.log`. Load with `launchctl load -w` (Ryan pastes it; same pattern as the mirror job).

## Rules it enforces (F23)

- One morning summary per person, not a stream (the agent queues exactly one with tag `morning-YYYY-MM-DD`).
- The same fact is never pushed twice (dedupe by tag).
- Everything pushed is also on Today (the agent writes the Today line first, then queues).
- The household TV never notifies (no subscription is ever created from `/tv`).
- Quiet hours per person; safety and system-red ignore them.
- Every send is a row with `sent_at`, so "did you tell me?" is answerable from the Log.
