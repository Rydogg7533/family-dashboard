-- Routine steps the app has noticed the household doing two months running, offered for a Yes or No. Never added by itself.
create table if not exists public.money_routine_candidates (
  key text primary key,
  label text not null,
  months text[] not null default '{}',
  times int not null default 0,
  typical_day int,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined')),
  step_id uuid references public.money_routine_steps(id),
  answered_by text, answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.money_routine_candidates enable row level security;
create policy "members read routine candidates" on public.money_routine_candidates for select to authenticated using (public.is_member());
create policy "members add routine candidates" on public.money_routine_candidates for insert to authenticated with check (public.is_member());
create policy "members change routine candidates" on public.money_routine_candidates for update to authenticated using (public.is_member()) with check (public.is_member());
revoke all on public.money_routine_candidates from anon, authenticated;
grant select, insert, update on public.money_routine_candidates to authenticated;
