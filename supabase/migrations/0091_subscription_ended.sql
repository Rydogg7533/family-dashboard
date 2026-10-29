-- "Is this a subscription?" gets a third answer: Ended (issue 984d6052, Ryan's rule of 2026-10-27). A subscription that
-- was cancelled before the app ever asked is still history worth keeping -- the charges happened -- so it goes on the
-- register as cancelled, with the day it ended, rather than being thrown away as "not one".
alter table public.recurring_items add column if not exists ended_at date;
alter table public.subscription_candidates drop constraint if exists subscription_candidates_status_check;
alter table public.subscription_candidates add constraint subscription_candidates_status_check
  check (status in ('asking','subscription','not_subscription','ended'));
comment on column public.recurring_items.ended_at is 'The last day it was in force, when the person said it had ended. Status is cancelled.';
