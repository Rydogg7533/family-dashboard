-- Instant messaging path.
-- 1) PostgREST's on_conflict cannot target a partial index, so the one-per-guid guard becomes a plain unique
--    index on (type, item_id); nulls are distinct, so rows without an item are unaffected.
drop index if exists public.notifications_message_once_idx;
create unique index if not exists notifications_type_item_once_idx on public.notifications(type, item_id);

-- 2) Realtime: the Mac mini listens for queued outbox lines (sends at once); the browser listens for its own
--    notifications (bubble at once). RLS applies to the browser's subscription, so a member only hears their rows.
alter publication supabase_realtime add table public.messages_outbox;
alter publication supabase_realtime add table public.notifications;
