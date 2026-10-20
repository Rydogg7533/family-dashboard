-- The Mac mini filing agent copies each filed document into Organized and records where.
alter table public.inbox_items
  add column if not exists copied_path text,
  add column if not exists copied_at timestamptz,
  add column if not exists copy_error text;
