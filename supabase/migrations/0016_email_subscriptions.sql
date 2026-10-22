-- Mailing lists found in a mailbox by the Mac mini agent scripts/email-subscriptions.mjs (headers only, never content).
-- Named email_subscriptions on purpose: recurring_items / subscription_candidates (0014, 0015) track paid recurring charges, a different thing.
-- The app may only toggle a row between 'active' and 'requested' (the person ticks and taps Unsubscribe). Every other status
-- (done, needs_tap, open_link, failed, stopped) is written by the agent with the service role, so the app can never claim an
-- unsubscribe that did not happen. Nothing is ever deleted: use deleted_at.
-- Already applied live (2026-10-22); this file keeps the repo in step.

create table public.email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references auth.users(id),
  mailbox text not null,
  sender_key text not null,
  sender_name text,
  address text,
  domain text,
  list_id text,
  unsub_http text,
  unsub_mailto text,
  one_click boolean not null default false,
  method text not null default 'none' check (method in ('one_click','mailto','link','none')),
  message_count integer not null default 0,
  first_seen date,
  last_seen date,
  status text not null default 'active' check (status in ('active','requested','done','needs_tap','open_link','failed','stopped')),
  status_note text,
  requested_at timestamptz,
  requested_by uuid references auth.users(id),
  completed_at timestamptz,
  messages_since_unsub integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person, mailbox, sender_key)
);

create index email_subscriptions_person_status_idx on public.email_subscriptions (person, status) where deleted_at is null;

alter table public.email_subscriptions enable row level security;

revoke all on table public.email_subscriptions from anon;
revoke all on table public.email_subscriptions from authenticated;
grant select on table public.email_subscriptions to authenticated;
grant update (status, requested_at, requested_by, updated_at) on table public.email_subscriptions to authenticated;

create policy "own reads email subscriptions" on public.email_subscriptions
  for select to authenticated
  using (is_member() and person = auth.uid());

create policy "own requests email unsubscribe" on public.email_subscriptions
  for update to authenticated
  using (is_member() and person = auth.uid() and status in ('active','requested'))
  with check (is_member() and person = auth.uid() and status in ('active','requested'));

comment on table public.email_subscriptions is 'Mailing lists found in a mailbox by the Mac mini mail agent (headers only). App may only toggle active/requested; the agent (service role) sets every other status. Never deleted: use deleted_at.';
