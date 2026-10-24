-- Today set-up cards (onboarding Stage 4): "Not now" hides one set-up step for a person until a date, then it comes back.
create table if not exists public.setup_dismissals (
  person uuid not null references public.profiles(id),
  step text not null check (step in ('push','mail','calendar','location','contacts')),
  until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (person, step)
);
alter table public.setup_dismissals enable row level security;
drop policy if exists "own reads dismissals" on public.setup_dismissals;
create policy "own reads dismissals" on public.setup_dismissals for select to authenticated using (is_member() and person = auth.uid());
drop policy if exists "own adds dismissals" on public.setup_dismissals;
create policy "own adds dismissals" on public.setup_dismissals for insert to authenticated with check (is_member() and person = auth.uid());
drop policy if exists "own changes dismissals" on public.setup_dismissals;
create policy "own changes dismissals" on public.setup_dismissals for update to authenticated using (is_member() and person = auth.uid()) with check (is_member() and person = auth.uid());
-- Column-level grants (the app inserts, then updates only `until`; it cannot change person or step on an existing row).
revoke all on public.setup_dismissals from anon, authenticated;
grant select on public.setup_dismissals to authenticated;
grant insert (person, step, until, updated_at) on public.setup_dismissals to authenticated;
grant update (until, updated_at) on public.setup_dismissals to authenticated;
