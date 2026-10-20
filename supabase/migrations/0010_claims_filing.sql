-- Claims: a reimbursement, warranty or dispute that spans several documents and a wait.
-- Documents attach to a claim; a task reminds someone to check on it.
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'reimbursement',          -- reimbursement | warranty | dispute | other
  vendor text,
  vehicle_id uuid references public.vehicles(id),
  expected_amount numeric,
  status text not null default 'open',                  -- open | submitted | paid | denied | closed
  check_by date,
  notes text,
  documents jsonb not null default '[]',                -- [{role, inbox_id, receipt_id, path, name}]
  opened_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.claims enable row level security;
create policy "members read claims" on public.claims for select to authenticated using (public.is_member());
create policy "members add claims" on public.claims for insert to authenticated with check (public.is_member());
create policy "members update claims" on public.claims for update to authenticated using (public.is_member()) with check (public.is_member());

-- Filing creates reminders.
create policy "members add tasks" on public.tasks for insert to authenticated with check (public.is_member());

-- Multi-page documents and a record of what a filing did.
alter table public.inbox_items
  add column if not exists pages jsonb,                 -- [{path,mime,size,sha256}] when a document has several pages (first page = file_path)
  add column if not exists filed jsonb;                 -- {receipt_id, vehicle_id, claim_id, task_id, duplicate_of}
