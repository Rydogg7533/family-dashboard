-- Children (step 3 of people-from-the-database), and a safe child login.
--
-- 1. is_member() no longer counts a child profile. Until now ANY profile passed is_member(), which every shared table's read policy uses
--    (money, receipts, accounts, mail, contacts, claims, the private storage bucket). A child login would have been able to read all of it
--    straight from the API. Parents (owner) and other adults (member) are unchanged; no child profile exists today.
-- 2. A child can read only their own rows: their profile, the household name, their own calendar events and pack lists. Their own-row
--    policies that already exist (day blocks, settings, push subscriptions) are untouched.
-- 3. `children`: family members shown in the app, with or without a login. Birth YEAR only (enough for the age check, holds less data).
--    Written by server actions with the service role after an owner check, so members get select only.
-- 4. household.child_login_min_age: the household default for when a child may have a login (a parent can override per child).

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role <> 'child');
$$;
create or replace function public.is_child() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'child');
$$;
revoke execute on function public.is_child() from public, anon;
grant execute on function public.is_child() to authenticated;

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  birth_year int not null check (birth_year between 1990 and 2100),
  login_min_age int check (login_min_age between 3 and 17),
  profile_id uuid unique references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.children enable row level security;
revoke all on public.children from anon, authenticated;
grant select on public.children to authenticated;
drop policy if exists "members read children" on public.children;
create policy "members read children" on public.children for select to authenticated using (public.is_member());

alter table public.household add column if not exists child_login_min_age int not null default 10 check (child_login_min_age between 3 and 17);

drop policy if exists "child reads own profile" on public.profiles;
create policy "child reads own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "child reads household" on public.household;
create policy "child reads household" on public.household for select to authenticated using (public.is_child());
drop policy if exists "child reads own events" on public.calendar_events;
create policy "child reads own events" on public.calendar_events for select to authenticated using (public.is_child() and (person = auth.uid() or person is null));
drop policy if exists "child reads own checklists" on public.checklists;
create policy "child reads own checklists" on public.checklists for select to authenticated using (public.is_child() and person = auth.uid());
drop policy if exists "child reads own checklist items" on public.checklist_items;
create policy "child reads own checklist items" on public.checklist_items for select to authenticated
  using (public.is_child() and exists (select 1 from public.checklists c where c.id = checklist_id and c.person = auth.uid()));
drop policy if exists "child ticks own checklist items" on public.checklist_items;
create policy "child ticks own checklist items" on public.checklist_items for update to authenticated
  using (public.is_child() and exists (select 1 from public.checklists c where c.id = checklist_id and c.person = auth.uid()))
  with check (public.is_child() and exists (select 1 from public.checklists c where c.id = checklist_id and c.person = auth.uid()));
