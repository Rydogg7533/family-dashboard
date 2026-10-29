-- Contact photos for Messages avatars (decisions log 2026-10-29d). Private bucket, one JPEG per contact, written by
-- the contacts sync (service role) and read through /api/avatar with a short signed link. Never public.
insert into storage.buckets (id, name, public, file_size_limit) values ('avatars', 'avatars', false, 2097152) on conflict (id) do nothing;
create policy "members read avatars" on storage.objects for select to authenticated using (bucket_id = 'avatars' and public.is_member());

alter table public.contact_cards add column if not exists photo_path text;      -- avatars/<person>/<uid>.jpg
alter table public.contact_cards add column if not exists photo_hash text;      -- sha1 of the vCard PHOTO, so an unchanged photo is not re-uploaded
-- The mirror fills this from the thread's handles: {"Melissa": "<photo_path>", ...}; members without a photo are absent.
alter table public.messages_threads add column if not exists avatars jsonb not null default '{}';
