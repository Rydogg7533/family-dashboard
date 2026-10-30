-- 0105_statements_door.sql
-- Statements get their own door (Ryan, 2026-10-30). The Inbox reads every file with a model; a statement must never be read that way.
-- This migration adds:
--   1. a private "statements" storage bucket that only OWNERS can write or read (the "captures" bucket lets every adult read everything);
--   2. statement_uploads: one row per uploaded statement. The browser uploads the file and inserts an 'uploaded' row;
--      the hub (service role) picks it up, reads it ON THE MAC with local OCR, and writes back what it found: shape only (which account,
--      which month, closing balance, whether the arithmetic ties, which fields it could not find). Statement text is never stored here;
--   3. account_statements.upload_id, so a statement read this way counts as "received" for the monthly routine like any other.
-- No model is called anywhere on this path. Pull, never push: nothing connects to the hub.
-- Copies, never deletes: rows are never removed; the hub's local copy is filed under Organized and never overwritten.
-- Policies wrap auth functions in (select ...) per 0104.

-- 1. The bucket. Owners only, in and out; PDFs and images; 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('statements', 'statements', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "owners add statement files" on storage.objects for insert to authenticated
  with check (bucket_id = 'statements' and (select public.is_owner()) and name like (select auth.uid())::text || '/%');
create policy "owners read statement files" on storage.objects for select to authenticated
  using (bucket_id = 'statements' and (select public.is_owner()));

-- 2. One row per uploaded statement.
create table if not exists public.statement_uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id),
  file_path text not null unique,              -- path in the "statements" bucket: <user id>/<date>/<8 chars>-<name>
  original_name text not null,
  mime text,
  size_bytes bigint,
  sha256 text,
  status text not null default 'uploaded' check (status in ('uploaded', 'reading', 'read', 'needs_account', 'failed')),
  account_id text references public.accounts(id),
  period text check (period is null or period ~ '^\d{4}-\d{2}$'),
  closing_date date,
  statement_balance numeric,
  tie_ok boolean,                              -- null when too few figures were found to check the arithmetic
  tie_note text,                               -- one short line, never a statement line
  read_source text check (read_source is null or read_source in ('pdf-text', 'vision', 'mixed')),
  page_count int,
  missing text[] not null default '{}',        -- names of fields the reader could not find, never values
  error text,
  uploaded_at timestamptz not null default now(),
  picked_at timestamptz,
  read_at timestamptz,
  local_copy text                              -- where the hub filed its copy, relative to the hub's home folder
);
create index if not exists statement_uploads_open_idx on public.statement_uploads (uploaded_at) where status in ('uploaded', 'reading', 'needs_account');
create index if not exists statement_uploads_account_idx on public.statement_uploads (account_id, period);

alter table public.statement_uploads enable row level security;
revoke all on public.statement_uploads from anon, authenticated;
grant select, insert on public.statement_uploads to authenticated;
grant update (account_id, period) on public.statement_uploads to authenticated;   -- an owner can say which account and month; nothing else is editable from the browser

create policy "owners read statement uploads" on public.statement_uploads for select to authenticated
  using ((select public.is_owner()));
create policy "owners add statement uploads" on public.statement_uploads for insert to authenticated
  with check ((select public.is_owner()) and uploaded_by = (select auth.uid()) and status = 'uploaded');
create policy "owners pick the account" on public.statement_uploads for update to authenticated
  using ((select public.is_owner()) and status = 'needs_account')
  with check ((select public.is_owner()) and status = 'needs_account');
-- No delete policy: rows are never deleted.

-- 3. A statement read this way is a filed statement for its account and month.
alter table public.account_statements alter column inbox_id drop not null;
alter table public.account_statements add column if not exists upload_id uuid unique references public.statement_uploads(id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'account_statements_one_source') then
    alter table public.account_statements add constraint account_statements_one_source check (inbox_id is not null or upload_id is not null);
  end if;
end $$;

comment on table public.statement_uploads is 'Statements uploaded to the owner-only statements bucket and read on the hub with local OCR. No model touches this path; statement text is never stored.';
comment on column public.statement_uploads.missing is 'Field names the reader could not find (for example closing_balance), never values.';
