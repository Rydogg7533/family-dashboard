-- Standalone warranties (anything not tied to a vehicle or a device). The Warranties page also reads vehicles.details.warranties and devices.warranty_end.
create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  provider text,
  for_who text,
  start_date date,
  end_date date,
  terms text,
  proof text,
  added_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.warranties enable row level security;
create policy "members read warranties" on public.warranties for select to authenticated using (public.is_member());
create policy "members add warranties" on public.warranties for insert to authenticated with check (public.is_member());
create policy "members change warranties" on public.warranties for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members remove warranties" on public.warranties for delete to authenticated using (public.is_member());
