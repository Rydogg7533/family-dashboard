-- F25: each person's own Apple Contacts, synced over CardDAV by the Mac mini (scripts/contacts-sync.mjs).
-- The household directory (public.contacts) stays as it is; this table holds the person's real cards.
-- Apple Contacts remains the source of truth (write-back rule, F19.1); the dashboard is a view.
create table public.contact_cards (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  uid text not null,                                -- vCard UID (stable id of the card in iCloud)
  href text,                                        -- CardDAV path of the card
  etag text,                                        -- CardDAV etag; unchanged etag = skip
  full_name text not null,
  first_name text, last_name text, nickname text, org text,
  phones jsonb not null default '[]',               -- [{label, number, digits}]
  emails jsonb not null default '[]',               -- [{label, address}]
  addresses jsonb not null default '[]',            -- [{label, street, city, state, zip, country}]
  birthday text,                                    -- "YYYY-MM-DD" or "--MM-DD" when the year is unknown
  notes text,
  registers text[] not null default '{}',           -- links to Health / Home / School / Vehicles (F12.9)
  shared boolean not null default false,            -- visible to the other parent
  for_children boolean not null default false,      -- visible on a child's page
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,                           -- the card is gone from iCloud; kept for links, hidden
  unique (person, uid)
);
create index contact_cards_person_name_idx on public.contact_cards(person, last_name, first_name);

alter table public.contact_cards enable row level security;
create policy "own reads contact cards" on public.contact_cards for select
  using (public.is_member() and (person = auth.uid() or shared));
create policy "own updates contact cards" on public.contact_cards for update using (person = auth.uid()) with check (person = auth.uid());
