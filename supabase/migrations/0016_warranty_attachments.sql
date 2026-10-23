-- Files on a standalone warranty: [{path, name, role: 'receipt' | 'warranty info'}], stored in the private captures bucket.
alter table public.warranties add column if not exists attachments jsonb not null default '[]'::jsonb;
