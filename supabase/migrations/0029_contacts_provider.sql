-- Contacts provider (F25c). Each person chooses where their address book lives: iCloud, Google, or none.
-- Additive only: nothing is dropped or loosened. Existing cards and edits are all iCloud, so they default to 'icloud'.
--
--   person_connections   one row per person and kind ('contacts' for now; mail and calendar can follow). The app writes the
--                        choice (provider, account); the Mac mini writes status, note, cursor and last_synced_at.
--   contact_cards.provider / contact_edits.provider   which sync owns the row, so each Mac mini job touches only its own.
--
-- Switching provider never deletes cards: the app hides the old provider's cards (deleted_at), and a later switch back brings
-- them back at the next sync, because the sync un-hides any card it sees again.

create table if not exists public.person_connections (
  person uuid not null references public.profiles(id),
  kind text not null check (kind in ('contacts')),
  provider text not null check (provider in ('icloud','google','none')),
  account text,                                   -- Apple ID or Google address the Mac mini signs in as (not a secret)
  status text not null default 'waiting' check (status in ('waiting','ok','error')),
  status_note text,
  sync_cursor text,                               -- Google sync token plus the account it belongs to (Mac mini only)
  last_synced_at timestamptz,
  changed_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (person, kind),
  check (provider <> 'google' or account is not null)   -- iCloud keeps its Apple ID and app password on the Mac mini
);
alter table public.person_connections enable row level security;

drop policy if exists "own reads connections" on public.person_connections;
create policy "own reads connections" on public.person_connections for select to authenticated
  using (is_member() and person = auth.uid());

drop policy if exists "own adds connections" on public.person_connections;
create policy "own adds connections" on public.person_connections for insert to authenticated
  with check (is_member() and person = auth.uid() and changed_by = auth.uid());

drop policy if exists "own changes connections" on public.person_connections;
create policy "own changes connections" on public.person_connections for update to authenticated
  using (is_member() and person = auth.uid())
  with check (is_member() and person = auth.uid() and changed_by = auth.uid());

-- Signed-in users get only the columns they should set. The cursor and last_synced_at belong to the Mac mini (service role).
revoke all on public.person_connections from anon, authenticated;
grant select on public.person_connections to authenticated;
grant insert (person, kind, provider, account, status, status_note, changed_by, updated_at) on public.person_connections to authenticated;
grant update (provider, account, status, status_note, changed_by, updated_at) on public.person_connections to authenticated;

alter table public.contact_cards add column if not exists provider text not null default 'icloud';
alter table public.contact_edits add column if not exists provider text not null default 'icloud';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contact_cards_provider_check') then
    alter table public.contact_cards add constraint contact_cards_provider_check check (provider in ('icloud','google'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_edits_provider_check') then
    alter table public.contact_edits add constraint contact_edits_provider_check check (provider in ('icloud','google'));
  end if;
end $$;
create index if not exists contact_cards_person_provider_idx on public.contact_cards (person, provider);
create index if not exists contact_edits_pending_provider_idx on public.contact_edits (provider, status, created_at);
