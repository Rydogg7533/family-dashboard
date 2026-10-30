-- Rich link cards in Messages (issue ec1c4e31). The app fetches a page's Open Graph tags once, from the server
-- (the household's device never touches the linked site just by viewing a message), and keeps the result here so
-- the same link in the same thread never costs a second fetch. No record data: only what the public page says about itself.
create table if not exists public.link_previews (
  url text primary key,
  site text,
  title text,
  description text,
  image text,
  ok boolean not null default false,
  fetched_at timestamptz not null default now()
);
alter table public.link_previews enable row level security;
create policy "members read link previews" on public.link_previews for select to authenticated using (public.is_member());
create policy "members cache link previews" on public.link_previews for insert to authenticated with check (public.is_member());
create policy "members refresh link previews" on public.link_previews for update to authenticated using (public.is_member()) with check (public.is_member());
