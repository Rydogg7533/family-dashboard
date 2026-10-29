-- A camera shortcut on the iPhone (lock screen, home screen, Action Button) posts a photo straight into the Inbox
-- (Ryan, 2026-10-29 12:27). It authenticates with a per-person device token of kind 'capture', issued and stopped in
-- Settings exactly like the Overland location token: upload-only, names the person, revocable, never shown twice.
alter table public.device_tokens drop constraint if exists device_tokens_kind_check;
alter table public.device_tokens add constraint device_tokens_kind_check check (kind in ('overland','tv','kitchen','capture'));
