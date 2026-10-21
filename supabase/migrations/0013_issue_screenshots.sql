-- Up to three screenshots per problem report: storage paths in the private captures bucket.
alter table public.issues add column if not exists screenshots jsonb not null default '[]'::jsonb;
