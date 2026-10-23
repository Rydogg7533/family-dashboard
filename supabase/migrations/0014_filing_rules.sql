-- Vendor → folder rules, made when someone corrects a filing folder. {year} is filled in from the document's date.
create table if not exists public.filing_rules (
  id uuid primary key default gen_random_uuid(),
  vendor_key text not null unique,
  vendor_label text not null,
  folder_template text not null,
  created_by uuid references public.profiles(id),
  source_item uuid,
  created_at timestamptz not null default now()
);
alter table public.filing_rules enable row level security;
create policy "members read filing rules" on public.filing_rules for select to authenticated using (public.is_member());
create policy "members add filing rules" on public.filing_rules for insert to authenticated with check (public.is_member());
create policy "members change filing rules" on public.filing_rules for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members remove filing rules" on public.filing_rules for delete to authenticated using (public.is_member());
