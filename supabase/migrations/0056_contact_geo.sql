-- Contact addresses turned into coordinates, with history. Written only by the Mac mini script scripts/contact-geo.mjs (service role).
-- Rows are never deleted: when a contact's address changes or the card goes away, the old row is closed (valid_until) and kept, so a visit
-- to someone's old house can still be recognised. A new address gets a new row. Each person reads only the rows for their own contacts.
create table public.contact_geo (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  card_id uuid not null references public.contact_cards(id),
  address_key text not null,                 -- normalised street|city|state|zip; a changed address is a different key
  address_text text not null,                -- as shown: "315 E Juanita, Glendora, CA 91741"
  label text,                                -- home / work / other, from the card
  name text not null,                        -- the card's full name at the last run
  last_name text, org text,
  lat double precision, lon double precision,
  status text not null check (status in ('ok', 'not_found')),
  geocoded_at timestamptz not null default now(),
  valid_until timestamptz,                   -- null = the card's current address; set = it stopped being current at this time
  created_at timestamptz not null default now()
);
create unique index contact_geo_current_idx on public.contact_geo (card_id, address_key) where valid_until is null;
create index contact_geo_person_idx on public.contact_geo (person, status);
alter table public.contact_geo enable row level security;
create policy "own reads contact geo" on public.contact_geo for select to authenticated using (person = auth.uid() and public.is_member());
