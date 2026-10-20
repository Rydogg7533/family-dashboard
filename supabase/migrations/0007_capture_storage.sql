-- Captured files (photos, scans, PDFs) are stored, not just named.
-- Private bucket; household members can add and read; nobody else, no public URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('captures', 'captures', false, 52428800)
on conflict (id) do nothing;

create policy "members add captures" on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and public.is_member());
create policy "members read captures" on storage.objects for select to authenticated
  using (bucket_id = 'captures' and public.is_member());

alter table public.inbox_items
  add column if not exists file_path text,
  add column if not exists mime text,
  add column if not exists size_bytes bigint,
  add column if not exists sha256 text;

create index if not exists inbox_items_sha256_idx on public.inbox_items (sha256) where sha256 is not null;
