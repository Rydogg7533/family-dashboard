-- 0068_documents_catalog.sql
-- The document catalog (D98): what each file on the hub IS, never what it says. The walker on the hub
-- writes these rows with the service role; the page text stays in the hub's own index. Members read.
-- A file that disappears from the hub is marked gone_at, never removed.
create table if not exists public.documents (
  hub_id bigint primary key,                 -- the walker's own id, so pushes are idempotent
  path text not null unique,                 -- relative to the hub's home folder, starts with Organized/
  name text not null,
  ext text not null,
  size bigint not null,
  sha256 text,
  kind text,                                 -- receipt | statement | bill | warranty | tax | insurance | record | photo | other
  doc_date date,
  subject text,                              -- Personal | Business/<entity> | Vehicles/<name> | …
  pages int not null default 0,
  read_at timestamptz,                       -- null = catalogued by name only
  read_source text,                          -- pdf-text | vision | text | mixed | name-only | error
  confidence real,
  gone_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists documents_date_idx on public.documents (doc_date desc) where gone_at is null;
create index if not exists documents_subject_idx on public.documents (subject, kind) where gone_at is null;
alter table public.documents enable row level security;
create policy "members read documents" on public.documents for select to authenticated using (public.is_member());
-- no insert/update policy: only the service role (the hub) writes
