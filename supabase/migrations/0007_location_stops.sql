-- F3: the layer between raw Overland points and the day record.
-- Raw points (locations) → stops (location_stops, kept) → Places (coordinates added here) → day_blocks.
-- Written by scripts/location-agent.mjs on the Mac mini (service key). Readable only by the owner.

-- Places need a position to be matched "within 150 m", and the usual pattern the fill rule checks.
alter table public.places
  add column lat double precision,
  add column lon double precision,
  add column radius_m int not null default 100,
  add column usual_start time,                      -- learned from visits: median arrival
  add column usual_minutes int,                     -- learned from visits: median duration
  add column usual_days int[] not null default '{}', -- 0=Sun … 6=Sat, days this place is usually visited
  add column last_visit_at timestamptz,
  add column confirmed boolean not null default false; -- true once the person named it (an answer), or it is Home
create index places_person_latlon_idx on public.places(person, lat, lon);

-- One row per stop: a cluster of points within ~75 m for ≥ 8 minutes. The open stop is the one still in progress.
create table public.location_stops (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  lat double precision not null, lon double precision not null,
  points int not null default 0,
  status text not null default 'open' check (status in ('open','filled','question','answered','private','skipped')),
  place_id uuid references public.places(id),
  confidence numeric check (confidence between 0 and 1),
  address text,                                     -- reverse-geocoded only when the stop becomes a question
  suggestions text[] not null default '{}',
  day_block_id uuid references public.day_blocks(id) on delete set null,
  answer text,                                      -- what the person tapped or typed ("Dentist", "Personal", "Skip")
  applied_at timestamptz,                           -- when the agent turned the answer into a Place / block
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index location_stops_person_time_idx on public.location_stops(person, started_at desc);
create index location_stops_question_idx on public.location_stops(person, status) where status in ('open','question','answered');

alter table public.location_stops enable row level security;
create policy "owner reads own stops"   on public.location_stops for select using (person = auth.uid());
create policy "owner answers own stops" on public.location_stops for update using (person = auth.uid()) with check (person = auth.uid());

-- Points that have been folded into a stop are marked 'stop'; the nightly retention delete removes raw and stop
-- points older than 30 days. Stops, Places and day_blocks remain (never the raw track).
