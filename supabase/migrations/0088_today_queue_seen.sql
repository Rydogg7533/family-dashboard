-- Today queue (decisions 2026-10-28 D23): one queue on Today, one badge. The badge is the number of queue items the
-- person has not seen yet; opening Today marks everything seen. One timestamp per person is all that needs.
alter table public.profiles add column if not exists today_seen_at timestamptz;
comment on column public.profiles.today_seen_at is 'Last time this person opened Today. Queue items created after it count as new (Today tab and app icon badge).';
-- Updating one's own row is already allowed by "person updates own assistant prefs" (0081); the prefs trigger only guards role and name.
