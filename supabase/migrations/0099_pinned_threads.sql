-- Pinned conversations, like the Messages app: a person's own list of thread ids, in order, shown as large avatars
-- above the list. Per person (Ryan and Melissa pin differently); an unpinned thread just drops back into the list.
alter table public.profiles add column if not exists pinned_threads text[] not null default '{}';
