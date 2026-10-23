-- The Assistant feed (D73): everything the assistant proposes, drafts, does or declines, in one list, with who asked.
-- A proposal is written when it is shown (needs_you) and resolved when the person taps (done / failed) or says no (declined).
-- New edits to the same conversation supersede the open proposal. The accept/decline history is what lets autonomy be earned per source.
-- Content stays short (titles and one line of detail); never message bodies, never account numbers. Nothing here is ever deleted.
create table if not exists public.assistant_feed (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  source text not null,                       -- ask | messages | email | calendar | brief | system
  kind text not null check (kind in ('proposal','action','draft','alert','brief')),
  status text not null default 'info' check (status in ('needs_you','done','declined','failed','superseded','info')),
  title text not null,
  detail text,
  actor text not null,                        -- who asked (an email) or 'assistant'
  thread_key text,                            -- groups the edits of one conversation
  link text,
  ref text,
  decided_at timestamptz,
  decided_by text
);
create index if not exists assistant_feed_at_idx on public.assistant_feed(at desc);
create index if not exists assistant_feed_open_idx on public.assistant_feed(status, thread_key);
alter table public.assistant_feed enable row level security;
create policy "members read feed" on public.assistant_feed for select using (public.is_member());
create policy "members add to feed" on public.assistant_feed for insert with check (public.is_member());
create policy "members resolve feed" on public.assistant_feed for update using (public.is_member()) with check (public.is_member());
