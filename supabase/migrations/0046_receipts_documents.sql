-- A purchase keeps every document that shows it (the emailed copy, the photo at the register, a PDF).
-- documents: [{inbox_id, path, name, source, added_at}]. Additive; file_path stays as the first document.
alter table public.receipts add column if not exists documents jsonb not null default '[]'::jsonb;
