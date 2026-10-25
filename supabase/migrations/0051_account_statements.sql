-- One row per statement document filed for an account and period. Never deleted. The file itself stays in the Inbox capture
-- (and its copy under Organized/Personal/Documents/Finance/<year>/Statements/<account>/ when the filing agent runs).
create table if not exists public.account_statements (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts(id),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  inbox_id uuid not null unique references public.inbox_items(id),
  file_path text,
  name text,
  closing_date date,
  statement_balance numeric,
  due_date date,
  filed_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists account_statements_account_period_idx on public.account_statements(account_id, period);
alter table public.account_statements enable row level security;
create policy "members read statements" on public.account_statements for select to authenticated using (public.is_member());
create policy "members add statements" on public.account_statements for insert to authenticated with check (public.is_member());
revoke all on public.account_statements from anon, authenticated;
grant select, insert on public.account_statements to authenticated;
