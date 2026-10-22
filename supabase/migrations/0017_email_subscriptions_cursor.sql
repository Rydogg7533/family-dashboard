-- Cursor for the subscription scanner: the Gmail internalDate (ms) of the newest message already counted.
-- The agent counts only newer messages, so overlapping scans never double-count.
-- Already applied live (2026-10-22); this file keeps the repo in step.
alter table public.email_subscriptions add column last_message_ts bigint;
comment on column public.email_subscriptions.last_message_ts is 'Gmail internalDate (ms) of the newest message already counted. The agent counts only newer messages, so overlapping scans never double-count.';
