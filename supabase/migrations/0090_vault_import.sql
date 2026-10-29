-- Mapping documents into 1Password, from the app instead of a Terminal window and a localhost page
-- (decisions 2026-10-29 D27–D29; mockup approved 06:51).
--
-- Pull, never push, exactly as fetch_requests (D104): the app asks for a folder to be read, the hub's script picks the
-- request up, does the reading, the OCR and the 1Password work on the Mac, and writes what it found back here. No inbound
-- port on the hub. The app never sees a vault secret: an item's contents never leave the Mac, only what the person needs
-- in order to decide -- the file name, what the scan looked like, the date read from it, and which checklist row it fits.
--
-- A run moves: requested -> scanning -> ready -> applying -> done (or failed). The person edits the items while the run
-- is 'ready'; everything after that is the hub's.

create table if not exists public.vault_imports (
  id uuid primary key default gen_random_uuid(),
  folder text not null,                                  -- the folder on the Mac, as the person typed it
  status text not null default 'requested' check (status in ('requested','scanning','ready','applying','done','failed')),
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  picked_at timestamptz,                                 -- the hub saw it
  scanned_at timestamptz,                                -- items written, waiting on the person
  applied_at timestamptz,
  found int not null default 0,
  created int not null default 0,                        -- items made in 1Password
  error text,
  delete_folder boolean not null default false,          -- the person asked for the source folder to be removed after
  folder_deleted_at timestamptz
);
create index if not exists vault_imports_open_idx on public.vault_imports (requested_at) where status in ('requested','applying');

create table if not exists public.vault_import_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.vault_imports(id) on delete cascade,
  file_name text not null,                               -- what the person will recognise; several when one card is two sides
  file_count int not null default 1,
  is_pdf boolean not null default false,
  thumb text,                                            -- storage path of a small preview, or null
  kind text,                                             -- passport | drivers_license | insurance_card | registration | …
  reads_as text,                                         -- "an insurance card", in words, for the card's second line
  title text,                                            -- proposed name in 1Password
  vault_id text,
  vault_name text,
  expires_on date,
  date_note text,                                        -- "guess: expires 12/18/2033" | "no date read"
  preview text,                                          -- first ~220 characters the OCR read; never the whole document
  bucket text not null default 'needs' check (bucket in ('needs','ready','done')),
  reason text,                                           -- plain words: why it is in that bucket
  row_ids uuid[] not null default '{}',                  -- the checklist rows it fills; several when one scan covers several people
  include boolean not null default true,
  note text,
  result text,                                           -- what happened on apply, written by the hub
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vault_import_items_run_idx on public.vault_import_items (import_id, bucket);

alter table public.vault_imports enable row level security;
alter table public.vault_import_items enable row level security;

-- A run and its items are the asker's own. Reading someone else's would show which documents they are filing.
create policy "own vault imports" on public.vault_imports for select to authenticated
  using (public.is_member() and requested_by = auth.uid());
create policy "member asks for a vault import" on public.vault_imports for insert to authenticated
  with check (public.is_member() and requested_by = auth.uid());
-- The person may only ask for the apply to start, and ask for the folder to be deleted. Every other status is the hub's.
create policy "own vault import apply" on public.vault_imports for update to authenticated
  using (public.is_member() and requested_by = auth.uid() and status = 'ready')
  with check (public.is_member() and requested_by = auth.uid() and status in ('ready','applying'));
grant update (status, delete_folder) on table public.vault_imports to authenticated;

create policy "own vault import items" on public.vault_import_items for select to authenticated
  using (exists (select 1 from public.vault_imports r where r.id = import_id and r.requested_by = auth.uid()) and public.is_member());
-- Editing is the whole point of the screen, but only the decisions -- never what the scan said, never the bucket it
-- was put in, never the result.
create policy "own vault import item edits" on public.vault_import_items for update to authenticated
  using (exists (select 1 from public.vault_imports r where r.id = import_id and r.requested_by = auth.uid() and r.status = 'ready') and public.is_member())
  with check (exists (select 1 from public.vault_imports r where r.id = import_id and r.requested_by = auth.uid() and r.status in ('ready','applying')) and public.is_member());
grant update (include, row_ids, title, vault_id, vault_name, expires_on, note, updated_at) on table public.vault_import_items to authenticated;

comment on table public.vault_imports is 'One folder-read on the hub. The app asks; the Mac does the OCR and the 1Password work and writes back what it found.';
comment on column public.vault_import_items.preview is 'The first ~220 characters the OCR read, so the person can tell what a document is. Never the whole document, never a secret.';
