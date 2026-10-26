-- 0062_head_and_maintainer.sql
--
-- Splits the three meanings of `owner` into addressable identities WITHOUT
-- changing any policy or any behaviour. Nothing reads these columns or these
-- functions yet. 0063 moves the policies over; 0064 sets Melissa to `parent`.
-- Reasoning: claude/stewardos-decisions-log-2026-10-26d.md (D84).
--
--   owner_id  the maintainer: decides which capabilities exist. Ryan, in every copy.
--   head_id   the head of household: configures the system. Exactly one person.
--
-- Both nullable on purpose. A fresh install has no profiles until the installer
-- creates the first user, and both functions return false while they are null,
-- so a half-installed copy fails closed rather than open.
--
-- No column grant is added for either column, so `authenticated` cannot write
-- them through PostgREST. Moving the head is a deliberate, head-only action and
-- gets its own migration when that screen exists.

alter table public.household
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists head_id  uuid references public.profiles(id) on delete set null;

comment on column public.household.owner_id is
  'The maintainer: decides which capabilities exist. Not a household role.';
comment on column public.household.head_id is
  'The head of household: configures the system. Exactly one person.';

-- Backfill to the first owner the installer created. Portable across copies --
-- no email is hardcoded. Only fills a null, so re-running this changes nothing.
update public.household h
set owner_id = coalesce(h.owner_id, f.id),
    head_id  = coalesce(h.head_id,  f.id)
from (select id from public.profiles where role = 'owner' order by created_at limit 1) f
where h.owner_id is null or h.head_id is null;

create or replace function public.is_head() returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.household where head_id = auth.uid());
$$;

create or replace function public.is_maintainer() returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.household where owner_id = auth.uid());
$$;

-- Same convention as is_member() / is_owner(): authenticated only.
revoke execute on function public.is_head()       from public, anon;
revoke execute on function public.is_maintainer() from public, anon;
grant  execute on function public.is_head()       to authenticated;
grant  execute on function public.is_maintainer() to authenticated;
