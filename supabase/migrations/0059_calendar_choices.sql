-- Which calendars a person wants the app to read (D73). Google's own list is not the answer:
-- the app read every visible calendar on the account, so a ward calendar nobody chose showed up.
-- One row per person per calendar. No row = never seen = hidden, except on a person's first run
-- (see seedCalendarChoices), where everything on the account is seeded shown so nothing disappears.
create table public.calendar_choices (
  person uuid not null references public.profiles(id) on delete cascade,
  account text not null,
  calendar_id text not null,
  shown boolean not null default false,
  role text not null default 'show' check (role in ('show', 'suggestions', 'default')),
  name text,
  color text,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (person, account, calendar_id)
);
alter table public.calendar_choices enable row level security;
create policy "read own calendar choices" on public.calendar_choices for select to authenticated using (person = auth.uid());
create policy "add own calendar choices" on public.calendar_choices for insert to authenticated with check (person = auth.uid());
create policy "edit own calendar choices" on public.calendar_choices for update to authenticated using (person = auth.uid()) with check (person = auth.uid());
