# Messages mirror (Mac mini agent) — F16 / F17

A window on each person's **own** Messages threads. The mirror runs on the person's own Mac, signed in as them,
reads their Messages database, posts family threads to Supabase, and sends outgoing lines through Messages as them.
No dashboard-only messaging; if a thread is not in Messages, it does not exist here.

## What it does
- Reads `~/Library/Messages/chat.db` (read-only, via a copy) every 60 s.
- Mirrors **family threads only**: the group thread and one-to-one threads whose handles are in the family list
  (Settings › People). Everything else is ignored, never read past the handle check.
- Window: **30 days**. Rows older than 30 days are deleted from Supabase on every run; Messages and iCloud keep history.
- Writes `messages_threads` and `messages` with `person = <this person's profile id>` using the **service key**
  (owner-only RLS means the browser can only read its own rows).
- Sends: polls `assistant_confirmations`/an `outbox` for lines the person typed on the dashboard, sends them through
  Messages via AppleScript, as the signed-in account, so they appear on every device like a typed message.
- Reports `system_status` key `sync_messages` (ok / paused + summary) each run. A schema change after a macOS update
  must show "Messages mirror paused", never fail silently.

## Setup (per Mac: the mini for Ryan; Melissa's MacBook Air for Melissa, with her consent)
1. System Settings › Privacy & Security › **Full Disk Access** → add `/usr/bin/python3` (or the packaged mirror app).
   Also **Automation** → allow the mirror to control Messages (for sending).
2. Secrets in `~/_secrets_local_only/family-dashboard.env` (never cloud-synced; the folder is excluded from backups to cloud):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=...         # service role; only on this Mac, only in this file
   MIRROR_PERSON_ID=<profile uuid>  # whose threads this Mac mirrors
   MIRROR_FAMILY_HANDLES=+1801..., melissa@..., child1@...   # family only
   MIRROR_DAYS=30
   ```
3. launchd: `~/Library/LaunchAgents/com.ryan.messages-mirror.plist`, `StartInterval` 60, `RunAtLoad` true,
   log to `~/Library/Logs/messages-mirror.log`. Load with `launchctl load -w …`.
4. First run copies the db: `sqlite3 "file:$HOME/Library/Messages/chat.db?mode=ro" ".backup /tmp/mirror/chat.db"`
   then queries the copy (avoids WAL locks).

## Reading (reference queries against the copy)
```sql
-- threads (chats) with at least one family handle
select c.ROWID, c.guid, c.chat_identifier, c.display_name
from chat c join chat_handle_join chj on chj.chat_id = c.ROWID join handle h on h.ROWID = chj.handle_id
where h.id in (:family_handles) group by c.ROWID;

-- messages in the window
select m.ROWID, m.guid, m.text, m.attributedBody, m.is_from_me,
       datetime(m.date/1000000000 + 978307200, 'unixepoch') as at, h.id as sender, cmj.chat_id
from message m join chat_message_join cmj on cmj.message_id = m.ROWID left join handle h on h.ROWID = m.handle_id
where m.date/1000000000 + 978307200 > strftime('%s','now') - :days*86400 order by m.date;
```
Notes: on recent macOS the text is often only in `attributedBody` (a typedstream blob); decode it (e.g. `imessage_reader`
or a small typedstream parser) and fall back to `text`. Attachments: mirror only `{kind, label}`; the file stays in Messages.

## Sending (as the signed-in person)
```applescript
tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetChat to chat id "<chat guid>" -- or: buddy "<handle>" of targetService
  send "<text>" to targetChat
end tell
```
Only text the person typed (dashboard send box) or explicitly asked to send (a checklist, a schedule as text).
Never auto-send drafts.

## The assistant's thread (F17)
- A second macOS user **"Assistant"** on the mini stays signed into the assistant's own Apple ID (email only;
  Ryan's number as the trusted 2FA number, used only to sign in). Messages runs in that account, in the background.
- The same mirror runs there with `MIRROR_PERSON_ID` = the assistant's service profile and `MIRROR_FAMILY_HANDLES` =
  the family's addresses. Inbound lines from the family become Ask requests (same scope as F18); confirmations
  (`Y`, `N`, "later", "change it to 4:30") update `assistant_confirmations` — first answer wins over the dashboard.
- Messages from anyone outside the family list are ignored and logged.
- Tiers: low-risk → done and reported; medium → waits for Y; high-risk (money set-up, access, another person's data)
  → replies "this needs the dashboard" with a link.
- Every action is logged to `activity_log` with `via Messages` and the person's words.

## Privacy rules
- Family threads only; 30 days; owner-only rows; encrypted at rest (Supabase); no message text to any model unless
  the person turns that on in Settings (then task extraction runs on the mini or through `src/lib/ai.ts`).
- Children's pages never show Messages. Melissa's one-to-one threads appear only when her Mac runs the mirror.
- "Delete this thread's mirror" in Settings removes rows here, never in Messages.

## Fallback
Mirror down (Mac asleep, schema changed): `sync_messages` = paused; the Messages page shows "Open Messages" buttons and
the send box is disabled; paste into Ask still works. When it resumes it catches up the window.
