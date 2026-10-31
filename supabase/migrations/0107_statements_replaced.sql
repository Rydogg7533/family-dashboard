-- A filed statement that turned out to be the wrong file is marked replaced, never deleted: the row, the file and its copy stay as history.
-- Replaced rows no longer count as "filed" for the checks or the monthly routine, so the right upload files cleanly.
alter table public.account_statements
  add column if not exists replaced_at timestamptz,
  add column if not exists replaced_by text,
  add column if not exists replaced_note text;
create index if not exists account_statements_live_idx on public.account_statements (account_id, period) where replaced_at is null;
