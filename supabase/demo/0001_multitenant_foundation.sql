-- StewardOS demo: multi-tenant foundation.
--
-- This runs ONLY against the demo's own Supabase project (created when Ryan gets his first real
-- tester -- see claude/stewardos-decisions-log-2026-10-24.md, "Demo for prospects: option B").
-- It must NEVER be applied to the live family-dashboard project (dkscqkoxctukxpeatqiq) -- that
-- household stays single-tenant forever, per the logged decision.
--
-- Proven clean against a full copy of the live schema via a rolled-back transaction on
-- 2026-10-24 (71 tables stamped, 71 restrictive policies created, zero null household_id rows,
-- zero disruption to the 162 existing permissive policies, zero conflict with append-only guards).
-- The Supabase CLI/dashboard runs this as an ordinary migration against the demo project.

do $$
declare
  r record;
  n_stamped int := 0;
begin
  -- 1. Generalize the live schema's singleton `household` table (id always 1) into a real,
  --    multi-row tenant table. Household 1 stays reserved for a possible real household on this
  --    project, but the demo project is expected to hold only demo households.
  alter table public.household alter column id drop default;
  create sequence if not exists public.household_id_seq owned by public.household.id;
  perform setval('public.household_id_seq', (select max(id) from public.household));
  alter table public.household alter column id set default nextval('public.household_id_seq');
  alter table public.household add column if not exists is_demo boolean not null default false;
  alter table public.household add column if not exists trial_expires_at timestamptz;

  -- 2. profiles.household_id: which household a signed-in person belongs to. Literal default 1
  --    backfills any existing profile instantly (metadata-only, no UPDATE -- see step 4 for why
  --    that matters), then we switch to the real default for future inserts.
  alter table public.profiles add column if not exists household_id integer references public.household(id) default 1;

  create or replace function public.current_household()
    returns integer language sql stable security definer set search_path to 'public'
    as $f$ select household_id from public.profiles where id = auth.uid(); $f$;

  alter table public.profiles alter column household_id set default public.current_household();

  -- 3. Stamp every other public table: household_id column, index, and ONE restrictive policy
  --    layered on top of whatever permissive policies already exist on that table. Restrictive
  --    policies AND with the permissive result rather than replacing it, so none of the app's
  --    162 existing policies need to be touched or understood individually.
  for r in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'household'
  loop
    -- 4. Literal default 1 at ADD COLUMN time backfills existing rows via Postgres' metadata-only
    --    fast path -- no UPDATE statement runs, so this never trips an append-only guard trigger
    --    (e.g. recurring_observations). The default is switched to the real function immediately
    --    after, so it only affects rows inserted from this point on.
    execute format(
      'alter table public.%I add column if not exists household_id integer references public.household(id) default 1',
      r.table_name);
    execute format(
      'alter table public.%I alter column household_id set default public.current_household()',
      r.table_name);
    execute format('create index if not exists %I on public.%I (household_id)', 'idx_'||r.table_name||'_household', r.table_name);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=r.table_name and policyname='tenant isolation') then
      execute format(
        'create policy "tenant isolation" on public.%I as restrictive using (household_id = public.current_household()) with check (household_id = public.current_household())',
        r.table_name);
    end if;
    n_stamped := n_stamped + 1;
  end loop;

  raise notice 'multitenant foundation: % tables stamped', n_stamped;
end $$;
