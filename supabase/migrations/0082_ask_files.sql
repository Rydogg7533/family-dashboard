-- Photos and files sent with an Ask question (D13, 2026-10-28). The files themselves live in the private
-- 'captures' bucket under ask/<user id>/; the history row keeps only their paths, so the maintainer can read a
-- correction together with the picture it was about. [{path, mime, name}]
alter table public.ask_history add column if not exists files jsonb;
