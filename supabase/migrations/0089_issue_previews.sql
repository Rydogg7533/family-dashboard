-- Issue reports carry a small copy of each screenshot inside the row (Ryan, 2026-10-28 20:14: "I need you to be able to
-- see the images I upload for reports"). The maintainer's build session reaches the database but not the storage bucket,
-- so the full-size screenshot stays in `captures` for the app and a downscaled JPEG (long edge 1000 px, about 100 KB)
-- is kept here as [{mime, b64}]. Written once by the reporter with the report; same read policy as the row.
alter table public.issues add column if not exists previews jsonb not null default '[]'::jsonb;
alter table public.issues add constraint issues_previews_small check (pg_column_size(previews) < 700000);
comment on column public.issues.previews is 'Up to 3 downscaled JPEG copies of the screenshots, [{mime,b64}], so the maintainer can see them from the database.';
