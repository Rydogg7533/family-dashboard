-- Family Dashboard v1 schema. Two named users, read-only in the browser,
-- writes only by the service role (Mac mini agent) or server actions.

create extension if not exists pgcrypto;

-- People who may sign in. Rows are created by hand for Ryan and Melissa.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('owner','member','child')),
  created_at timestamptz not null default now()
);

-- One row per health signal: mirror, time_machine, free_space_mini,
-- free_space_8tb, heartbeat, inbox_watcher ...
create table public.system_status (
  key text primary key,
  state text not null check (state in ('ok','warn','error','unknown')),
  summary text not null,
  detail text,
  value_num numeric,
  updated_at timestamptz not null default now()
);

-- The source register (mirror of claude/source-register.md).
create table public.source_register (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  kind text,
  status text not null check (status in ('DONE','RUNNING','TODO','WAIT','OUT')),
  landed_at text,
  route text,
  backup text,
  last_verified date,
  open_items text,
  owner text,
  sort_order int not null default 100,
  updated_at timestamptz not null default now()
);

-- The one queue. Every item has an origin and a tier.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  person uuid references public.profiles(id),
  kind text not null check (kind in ('reply','do','decide','fyi')),
  title text not null,
  summary text,
  origin_kind text not null default 'manual',  -- email, message, receipt, calendar, system, manual
  origin_ref text,                              -- message id, file path, event id (never contents)
  due_at timestamptz,
  tier int not null default 2 check (tier in (1,2,3)), -- 1 quiet, 2 one tap, 3 explicit confirm
  status text not null default 'open' check (status in ('open','done','snoozed','dismissed')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_person_status_idx on public.tasks(person, status, due_at);

-- Append-only log of what the system did (the "handled quietly" list).
create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,            -- 'agent', 'ryan', 'melissa', 'system'
  action text not null,           -- filed, archived, unsubscribed, mirrored, task_created ...
  subject text not null,          -- short, no contents
  ref text,
  undoable boolean not null default false
);
create index activity_log_at_idx on public.activity_log(at desc);

-- Row-level security: signed-in people with a profile can read everything;
-- nobody writes from the browser.
alter table public.profiles enable row level security;
alter table public.system_status enable row level security;
alter table public.source_register enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_log enable row level security;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create policy "members read profiles"    on public.profiles        for select using (public.is_member());
create policy "members read status"      on public.system_status   for select using (public.is_member());
create policy "members read register"    on public.source_register for select using (public.is_member());
create policy "members read tasks"       on public.tasks           for select using (public.is_member());
create policy "members read log"         on public.activity_log    for select using (public.is_member());

-- The only browser-side writes in v1: a person closes, snoozes or dismisses
-- their own task. Everything else goes through the service role.
create policy "owner updates own task" on public.tasks for update
  using (public.is_member() and (person = auth.uid() or person is null))
  with check (status in ('open','done','snoozed','dismissed'));

-- Seed the health signals so the page has rows from day one.
insert into public.system_status (key, state, summary) values
  ('heartbeat',       'unknown', 'No report from the Mac mini yet'),
  ('mirror',          'unknown', 'Nightly mirror has not reported'),
  ('time_machine',    'unknown', 'Time Machine status not reported'),
  ('free_space_mini', 'unknown', 'Free space not reported'),
  ('free_space_8tb',  'unknown', 'Free space not reported');

-- Applied 2026-10-18 as separate migrations on the live project:
create policy "members insert log" on public.activity_log for insert with check (public.is_member());
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
