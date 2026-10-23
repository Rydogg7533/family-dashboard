-- Messages (F16): lines typed on the dashboard wait here until the person's own Mac sends them through Messages as them.
-- The app may only add its own rows and read them; status is changed only by the mirror (service role).
create table if not exists public.messages_outbox (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  thread_id text not null,
  text text not null check (length(text) between 1 and 4000),
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.messages_outbox enable row level security;
create policy "owner queues own lines" on public.messages_outbox for insert to authenticated with check (person = auth.uid() and status = 'queued');
create policy "owner reads own lines" on public.messages_outbox for select to authenticated using (person = auth.uid());
grant select, insert (person, thread_id, text) on public.messages_outbox to authenticated;
create index if not exists messages_outbox_queued_idx on public.messages_outbox (status, queued_at);
-- The mirror needs the Messages chat id to send into a thread; the row id already holds it (chat guid), nothing to add.
