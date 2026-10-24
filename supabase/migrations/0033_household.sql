-- The household itself (one row): name and time zone, written once by the first-run page (/setup, service role) and readable by members.
create table if not exists public.household (
  id int primary key default 1 check (id = 1),
  name text not null,
  tz text not null default 'America/Denver',
  created_at timestamptz not null default now(),
  setup_done_at timestamptz
);
alter table public.household enable row level security;
drop policy if exists "members read household" on public.household;
create policy "members read household" on public.household for select to authenticated using (is_member());
revoke all on public.household from anon, authenticated;
grant select on public.household to authenticated;
-- Ryan's household already exists: record it so /setup knows setup is done. A fresh install has no profiles, so this inserts nothing useful
-- there either way; /setup writes the real row.
insert into public.household (id, name, tz, setup_done_at)
select 1, 'Rossiter', 'America/Denver', now() where exists (select 1 from public.profiles)
on conflict (id) do nothing;
