-- Suggestion engine for Messages (decisions log 2026-10-29d). One row per judgment the mirror makes about an inbound
-- line: what kind of chip, how sure, and what happened to it. Rows under the bar are kept too (status hidden), so the
-- bar can learn and so a customer can see every judgment made about their texts.
create table public.message_suggestions (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id) on delete cascade,
  thread_id text not null,
  message_id text not null,                        -- iMessage guid; one judgment per line
  kind text not null check (kind in ('task','calendar','reply','receipt','none')),
  confidence numeric(3,2) not null,                -- 0..1 from the model
  title text,                                      -- the chip label, e.g. "Pick up Lily at 4"
  payload jsonb not null default '{}',             -- task: {title,due_at,for}; calendar: {title,start,end}; reply: {text}; receipt: {amount,merchant}
  reason text,                                     -- one line from the model: why
  status text not null default 'hidden' check (status in ('hidden','shown','taken','ignored','expired')),
  model text, in_tokens int, out_tokens int, latency_ms int,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (person, message_id)
);
create index message_suggestions_thread_idx on public.message_suggestions(person, thread_id, created_at desc);
create index message_suggestions_shown_idx on public.message_suggestions(person, created_at desc) where status = 'shown';

alter table public.message_suggestions enable row level security;
-- A person sees their own judgments; the browser may only mark them taken or ignored. The mirror (service role) writes.
create policy "own reads suggestions" on public.message_suggestions for select using (public.is_member() and person = auth.uid());
revoke update on table public.message_suggestions from authenticated;
grant update (status, decided_at) on table public.message_suggestions to authenticated;
create policy "own decides suggestions" on public.message_suggestions for update
  using (public.is_member() and person = auth.uid()) with check (public.is_member() and person = auth.uid() and status in ('taken','ignored'));

-- Per-household bar per kind; the engine raises it when chips are ignored and lowers it when taken.
create table public.suggestion_bars (
  person uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  bar numeric(3,2) not null default 0.80,
  taken int not null default 0, ignored int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (person, kind)
);
alter table public.suggestion_bars enable row level security;
create policy "own reads bars" on public.suggestion_bars for select using (public.is_member() and person = auth.uid());
