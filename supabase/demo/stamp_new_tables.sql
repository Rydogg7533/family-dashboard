-- StewardOS demo: idempotent re-stamp.
--
-- Run nightly (see .github/workflows/demo-sync.yml) after merging main into demo, so any table main
-- added since the last run gets household_id + the restrictive tenant-isolation policy automatically.
-- Safe to run any number of times: every statement is "if not exists" / "create or replace", and a
-- table that's already stamped is a no-op. This is the same stamping loop as step 3 of
-- 0001_multitenant_foundation.sql, pulled out standalone so it can run on its own on a schedule
-- without re-running the one-time household-table generalization (step 1) or household seed row.
--
-- NEVER run against the live family-dashboard project -- demo-only, per
-- claude/stewardos-decisions-log-2026-10-24.md.

do $$
declare
  r record;
  n_new int := 0;
begin
  for r in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'household'
      and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = information_schema.tables.table_name and c.column_name = 'household_id'
      )
  loop
    execute format(
      'alter table public.%I add column if not exists household_id integer references public.household(id) default 1',
      r.table_name);
    execute format(
      'alter table public.%I alter column household_id set default public.current_household()',
      r.table_name);
    execute format('create index if not exists %I on public.%I (household_id)', 'idx_'||r.table_name||'_household', r.table_name);
    execute format(
      'create policy "tenant isolation" on public.%I as restrictive using (household_id = public.current_household()) with check (household_id = public.current_household())',
      r.table_name);
    n_new := n_new + 1;
  end loop;

  raise notice 'stamp_new_tables: % newly-stamped table(s)', n_new;
end $$;
