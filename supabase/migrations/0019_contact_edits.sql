-- Two-way contacts (F25b). The app never writes to iCloud and never changes contact_cards fields itself: it queues an
-- edit here, and the Mac mini (scripts/contacts-push.mjs) applies it to the person's own iCloud address book, then
-- re-reads the card. status: pending → applied | conflict (iCloud changed first) | error. Cards are never deleted from here.
create table if not exists public.contact_edits (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  card_id uuid references public.contact_cards(id),
  op text not null check (op in ('create','update')),
  fields jsonb not null,
  base_etag text,
  status text not null default 'pending' check (status in ('pending','applied','conflict','error')),
  note text,
  summary text,
  requested_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  check ((op = 'create' and card_id is null) or (op = 'update' and card_id is not null))
);
create index if not exists contact_edits_pending_idx on public.contact_edits (status, created_at);
create index if not exists contact_edits_card_idx on public.contact_edits (card_id);
alter table public.contact_edits enable row level security;

drop policy if exists "own reads contact edits" on public.contact_edits;
create policy "own reads contact edits" on public.contact_edits for select to authenticated
  using (is_member() and person = auth.uid());

-- The app may only add a pending edit for its own address book. It cannot update or delete edits.
drop policy if exists "own queues contact edits" on public.contact_edits;
create policy "own queues contact edits" on public.contact_edits for insert to authenticated
  with check (is_member() and person = auth.uid() and requested_by = auth.uid() and status = 'pending' and applied_at is null);

-- Supabase grants new tables to signed-in users broadly (including truncate, which row-level security does not cover).
revoke all on public.contact_edits from anon, authenticated;
grant select, insert on public.contact_edits to authenticated;
