-- Numeric PIN logins and child invites.
--
-- child_features.pin_ok: a child who signs in with a 6-digit PIN may use this feature. Every harmless feature is PIN-OK, plus (Ryan's call,
--   2026-10-24) quick messages, the view-only allowance balance and both location features. Money you can act on, typed messages, health and
--   documents are not: they need a real password first. This is separate from `sensitive`, which still decides whether a parent must say yes
--   before the feature turns on.
-- children.pin_login: the child's login currently uses a PIN. Cleared when they set a real password. While true, child_can() is false for any
--   feature that is not pin_ok, whatever a parent set.
-- child_invites: a parent invites a child by link/QR. Only the SHA-256 of the token is stored; single use; expires; revocable. Written by
--   the server (service role); members may read their household's invites.

alter table public.child_features add column if not exists pin_ok boolean not null default false;
update public.child_features set pin_ok = true where not sensitive or key in ('quick_messages','allowance_view','checkin_location','own_location');
alter table public.children add column if not exists pin_login boolean not null default false;

create or replace function public.child_can(f text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.pin_login and not cf.pin_ok then false
      else case coalesce(c.access ->> f, '')
        when 'off' then false
        when 'on'  then true
        else (not cf.sensitive)
             and (extract(year from now())::int - c.birth_year - 1) >= coalesce((h.child_feature_ages ->> f)::int, cf.default_min_age)
      end
    end
    from public.children c
    join public.child_features cf on cf.key = f
    left join public.household h on h.id = 1
    where c.profile_id = auth.uid() and c.archived_at is null and c.paused_at is null
    limit 1
  ), false);
$$;
revoke execute on function public.child_can(text) from public, anon;
grant execute on function public.child_can(text) to authenticated;

create table if not exists public.child_invites (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id),
  email text not null,
  token_hash text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists child_invites_child_idx on public.child_invites(child_id);
alter table public.child_invites enable row level security;
revoke all on public.child_invites from anon, authenticated;
grant select (id, child_id, email, created_at, expires_at, accepted_at, revoked_at) on public.child_invites to authenticated;
drop policy if exists "members read invites" on public.child_invites;
create policy "members read invites" on public.child_invites for select to authenticated using (public.is_member());
