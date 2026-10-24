-- "Catalog everything you own" is a long, resumable task. The household picks areas (rooms); each area is marked done by a person; a final check
-- looks for gaps (items without photos) and records how it ended. Nothing is deleted: areas are archived, items stay.
create table if not exists public.catalog_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  state text not null default 'todo' check (state in ('todo','done')),
  nothing_here boolean not null default false,   -- the person confirmed there is nothing to catalog in this area
  done_at timestamptz,
  done_by text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists catalog_areas_name_idx on public.catalog_areas (lower(name)) where archived_at is null;

create table if not exists public.guided_tasks (
  key text primary key,
  started_at timestamptz not null default now(),
  started_by text,
  completed_at timestamptz,
  completed_by text,
  outcome text check (outcome in ('complete','complete_with_gaps')),
  gaps int,
  updated_at timestamptz not null default now()
);

alter table public.items add column if not exists area_id uuid references public.catalog_areas(id);
create index if not exists items_area_idx on public.items(area_id) where deleted_at is null;

alter table public.setup_dismissals drop constraint if exists setup_dismissals_step_check;
alter table public.setup_dismissals add constraint setup_dismissals_step_check check (step in ('push','mail','calendar','location','contacts','catalog'));

alter table public.catalog_areas enable row level security;
alter table public.guided_tasks enable row level security;
create policy "members read areas" on public.catalog_areas for select to authenticated using (public.is_member());
create policy "members add areas" on public.catalog_areas for insert to authenticated with check (public.is_member());
create policy "members change areas" on public.catalog_areas for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read guided tasks" on public.guided_tasks for select to authenticated using (public.is_member());
create policy "members add guided tasks" on public.guided_tasks for insert to authenticated with check (public.is_member());
create policy "members change guided tasks" on public.guided_tasks for update to authenticated using (public.is_member()) with check (public.is_member());
-- No delete policy on either table.
