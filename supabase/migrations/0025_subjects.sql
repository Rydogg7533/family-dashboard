-- D69 follow-up: anything a receipt can belong to (a vehicle, the house, an appliance, a person, a trip, a project, a business...)
-- is a "subject". Each subject with receipts gets a generated index page; nothing is ever deleted (links are retired with removed_at).
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (kind, name)
);
create table if not exists public.receipt_subjects (
  receipt_id uuid not null references public.receipts(id),
  subject_id uuid not null references public.subjects(id),
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (receipt_id, subject_id)
);
alter table public.subjects enable row level security;
alter table public.receipt_subjects enable row level security;
create policy "members read subjects" on public.subjects for select using (public.is_member());
create policy "members add subjects" on public.subjects for insert with check (public.is_member() and created_by = auth.uid());
create policy "members read receipt subjects" on public.receipt_subjects for select using (public.is_member());
create policy "members add receipt subjects" on public.receipt_subjects for insert with check (public.is_member() and added_by = auth.uid());
create policy "members retire receipt subjects" on public.receipt_subjects for update using (public.is_member()) with check (true);
