-- Photos, videos and GIFs from Messages, copied by the mirror into a private bucket so a thread here looks like the
-- thread in Messages. The copy lives as long as the message is in the window; Messages keeps the original forever.
-- messages.attachment becomes {kind, label, mime, path, bytes, w, h} (path = <person>/<guid>/<n>.<ext>); no path = not copied.
insert into storage.buckets (id, name, public, file_size_limit) values ('message-media', 'message-media', false, 52428800) on conflict (id) do nothing;
create policy "members read message media" on storage.objects for select to authenticated using (bucket_id = 'message-media' and public.is_member());
