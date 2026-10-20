alter table public.inbox_items
  add column if not exists read_result jsonb,
  add column if not exists suggested_name text,
  add column if not exists read_at timestamptz;
