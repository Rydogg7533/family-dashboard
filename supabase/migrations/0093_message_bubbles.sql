-- Message bubbles: an inbound iMessage line mirrored into public.messages queues a notification
-- (type='message', item_kind='message', item_id=<message guid>). The app shows undismissed rows as
-- one bubble per thread; dismissing the bubble or opening the thread sets dismissed_at.
alter table public.notifications add column if not exists dismissed_at timestamptz;

-- The mirror re-runs every minute; one notification per message, never two.
create unique index if not exists notifications_message_once_idx
  on public.notifications(item_id) where type = 'message';

-- What the bubble poll reads: my undismissed message rows, newest first.
create index if not exists notifications_bubbles_idx
  on public.notifications(person, queued_at desc) where type = 'message' and dismissed_at is null;

-- Members may set dismissed_at on their own rows and nothing else. The default grant covered every
-- column, so it is revoked first; the sender uses the service role and is unaffected.
revoke update on table public.notifications from authenticated;
grant update (dismissed_at) on table public.notifications to authenticated;
create policy "own dismisses" on public.notifications for update
  using (public.is_member() and person = auth.uid())
  with check (public.is_member() and person = auth.uid());
