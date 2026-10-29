-- Messages reads every conversation, not only family threads (decisions log 2026-10-29d). Per thread, two switches the
-- person controls: hidden (not shown in the app) and assistant_reads (the suggestion engine may read its inbound lines).
-- The mirror sets assistant_reads=true on a NEW thread whose members are all family handles, and never changes it after.
alter table public.messages_threads add column if not exists hidden boolean not null default false;
alter table public.messages_threads add column if not exists assistant_reads boolean not null default false;
alter table public.messages_threads add column if not exists is_family boolean not null default false;
alter table public.messages_threads add column if not exists handles text[] not null default '{}';   -- the chat's phone/email handles, for sending
revoke update on table public.messages_threads from authenticated;
grant update (hidden, assistant_reads) on table public.messages_threads to authenticated;
drop policy if exists "owner sets thread switches" on public.messages_threads;
create policy "owner sets thread switches" on public.messages_threads for update to authenticated using (person = auth.uid()) with check (person = auth.uid());

-- A new conversation started in the app: no thread yet, so the line carries who it is for. The mirror sends it to that
-- handle through Messages; the thread then appears on the next pass.
alter table public.messages_outbox alter column thread_id drop not null;
alter table public.messages_outbox add column if not exists to_handle text;     -- phone or email when thread_id is null
alter table public.messages_outbox drop constraint if exists messages_outbox_target;
alter table public.messages_outbox add constraint messages_outbox_target check (thread_id is not null or to_handle is not null);
grant insert (person, thread_id, to_handle, text) on public.messages_outbox to authenticated;
