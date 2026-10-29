-- Instant messaging path: Realtime on the two tables the fast path listens to.
-- The Mac mini listens for queued outbox lines (sends at once); the browser listens for its own notifications
-- (bubble at once). RLS applies to the browser's subscription, so a member only hears their rows.
-- (The one-per-guid guard stays the partial index from 0093: task notifications have several rows per item,
--  so a plain unique (type, item_id) is impossible; the mirror checks for existing guids before inserting.)
alter publication supabase_realtime add table public.messages_outbox;
alter publication supabase_realtime add table public.notifications;
