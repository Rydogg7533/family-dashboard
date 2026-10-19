-- Slice C: day (F3/F5/F6), calendar cache, messages mirror (F16/F17), shopping (F20), voice (F21), device tokens (F19.6, Overland).
-- Members read shared tables via public.is_member(). Person-private tables (locations, messages_threads, messages,
-- assistant_confirmations) are readable only by their owner: person = auth.uid(). Writes come from the Mac mini agents
-- (service role) except the few browser writes marked below.

-- ---------- calendar cache and the day ----------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  person uuid references public.profiles(id),      -- null = shared family calendar
  person_name text,
  calendar_name text not null,                      -- 'Google Calendar', 'Apple Calendar', 'Team calendar'
  external_id text,                                 -- id in the source; the source stays the truth (F19.1)
  date date not null,
  start_time time, end_time time,
  title text not null,
  place text,
  is_trip boolean not null default false,
  kind text not null default 'event' check (kind in ('event','recurring')),
  cycle text,
  weather jsonb,                                    -- {temp, hi, precip, wind, note, icon} for the block's time and place (F5)
  from_message text,                                -- original line when added from Messages (F16)
  source_href text,
  synced_at timestamptz not null default now()
);
create index calendar_events_date_idx on public.calendar_events(date, start_time);

-- One row per block of a person's day: calendar windows plus gaps filled from location (F3).
create table public.day_blocks (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  person_name text,
  date date not null,
  start_time time not null, end_time time not null,
  title text not null,
  place text,
  place_id uuid,                                    -- learned Place (Places register, slice A/F3)
  kind text not null check (kind in ('calendar','inferred','free','unknown','private')),
  confidence numeric check (confidence between 0 and 1),
  travel_min int,
  weather jsonb,
  source_name text, source_href text,
  answered_with text,                               -- what the person tapped in "Questions for you"
  created_at timestamptz not null default now()
);
create index day_blocks_person_date_idx on public.day_blocks(person, date, start_time);

-- Activity checklists (F6): base list per activity per person; items in three layers.
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  person uuid references public.profiles(id),      -- null = shared (family trip)
  activity text not null,                           -- 'Soccer practice', 'Dentist', 'Beach house'
  draft boolean not null default true,              -- "draft, confirm or edit" until confirmed once
  created_at timestamptz not null default now(),
  unique (person, activity)
);
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  label text not null,
  layer text not null default 'always' check (layer in ('always','today','done_before')),
  weather boolean not null default false,           -- added by the forecast (F5)
  learned boolean not null default false,           -- promoted after being added twice
  for_date date,                                    -- 'today' items belong to one occasion
  packed boolean not null default false,
  times_added int not null default 1,
  times_removed int not null default 0,
  updated_at timestamptz not null default now()
);
create index checklist_items_list_idx on public.checklist_items(checklist_id, layer);

-- Raw location points from Overland, person-private. Retention: 30 days of raw points, then only Places and
-- day_blocks remain (the nightly job on the Mac mini deletes rows older than 30 days; see scripts/location-agent.md).
create table public.locations (
  id bigint generated always as identity primary key,
  person uuid not null references public.profiles(id),
  recorded_at timestamptz not null,
  lat double precision not null, lon double precision not null,
  accuracy_m double precision,
  speed double precision,
  motion text[] not null default '{}',              -- Overland: stationary, walking, running, automotive, cycling
  battery double precision,
  source text not null default 'overland',
  status text not null default 'raw' check (status in ('raw','stop','question','answered','private')),
  address text,                                     -- reverse-geocoded only for stops that become questions
  suggestions text[] ,
  created_at timestamptz not null default now()
);
create index locations_person_time_idx on public.locations(person, recorded_at desc);
create index locations_question_idx on public.locations(person, status) where status = 'question';

-- ---------- messages mirror (F16) and the assistant thread (F17) ----------
-- Mirrored by the person's own Mac from their own Messages database. Family threads only. 30-day retention:
-- the mirror deletes rows older than 30 days on every run; full history stays in Messages and iCloud.
create table public.messages_threads (
  id text primary key,                              -- chat guid from Messages, or 'assistant'
  person uuid not null references public.profiles(id),   -- whose mirror this is (owner-only)
  kind text not null check (kind in ('assistant','group','direct')),
  name text not null,
  members text[] not null default '{}',
  last_line text, last_at timestamptz,
  unread int not null default 0,
  pending_yn int not null default 0,
  mirrored boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.messages (
  id text primary key,                              -- message guid from Messages
  thread_id text not null references public.messages_threads(id) on delete cascade,
  person uuid not null references public.profiles(id),
  sender text not null,
  is_me boolean not null default false,
  at timestamptz not null,
  text text,                                        -- encrypted at rest by Supabase; never sent to a model unless the person turns that on
  attachment jsonb,                                 -- {kind:'photo'|'link', label}; the file itself stays in Messages
  action jsonb,                                     -- {kind:'task_proposed'|'task_created'|'schedule_added', label, status}
  assistant_kind text check (assistant_kind in ('confirmation','command','answer','notice')),
  created_at timestamptz not null default now()
);
create index messages_thread_at_idx on public.messages(thread_id, at);
create index messages_retention_idx on public.messages(at);

-- Y/N questions the assistant asked, by text or on the dashboard. First answer wins; the other place shows "answered".
create table public.assistant_confirmations (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  question text not null,
  action_kind text not null,                        -- task, schedule, list, record ...
  action_payload jsonb,
  via text not null default 'messages' check (via in ('messages','dashboard')),
  status text not null default 'waiting' check (status in ('waiting','yes','no','stale')),
  asked_at timestamptz not null default now(),
  answered_at timestamptz, answered_via text,
  message_id text references public.messages(id)
);

-- ---------- shopping (F20) ----------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  store text not null check (store in ('amazon','smiths','costco')),
  shared boolean not null default true,             -- shared between parents
  updated_at timestamptz not null default now(),
  unique (store)
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid references public.carts(id) on delete cascade,
  store text not null check (store in ('amazon','smiths','costco')),
  name text not null,
  asin text,                                        -- Amazon product id for the add-to-cart link
  store_sku text,
  qty int not null default 1,
  price_note text,
  note text,
  is_regular boolean not null default false,        -- a regular item (seeded from receipts and order history)
  cadence_days int, last_bought date, due boolean not null default false,
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now()
);
create index cart_items_store_idx on public.cart_items(store, is_regular);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store text not null check (store in ('amazon','smiths','costco')),
  order_ref text,                                   -- the store's order number (shown; never card numbers)
  placed_at timestamptz not null,
  item_count int not null default 0,
  total_note text,
  status text not null check (status in ('placed','shipped','out_for_delivery','delivered','received','problem')),
  window_note text,
  has_photo boolean not null default false,
  tracking_note text,
  source_name text, source_href text,               -- the email or text the status came from (F1 pipeline)
  case_id uuid,
  received_by uuid references public.profiles(id), received_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.shop_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  store text not null,
  item text not null,
  issue text not null check (issue in ('missing','wrong','damaged','not_delivered')),
  price_note text,
  route text,
  status text not null default 'building' check (status in ('building','submitted','store_replied','refund_promised','refund_posted','resolved')),
  promised_by date,
  steps jsonb not null default '[]',                -- [{at, what, by:'assistant'|'you'|'store', done}]
  resolved_by uuid references public.profiles(id), resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- voice agent (F21) ----------
create table public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  callee text not null,
  number_note text,                                 -- masked
  on_behalf_of text,
  requested_by uuid references public.profiles(id),
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval','approved','calling','needs_you','done','declined')),
  limits jsonb not null,                            -- {may_state[], accept, max_dollars, if_asked_more}
  approved_by uuid references public.profiles(id), approved_at timestamptz, approved_via text,
  outcome text, summary text, transcript_ref text,  -- transcript stored by the platform; reference only
  duration_min numeric, cost_note text,
  recorded boolean not null default false,
  case_href text,
  requested_at timestamptz not null default now()
);

-- ---------- device tokens: Overland (per person) and the household TV ----------
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('overland','tv')),
  label text not null,                              -- "Ryan's iPhone (Overland)", "Family room TV"
  person uuid references public.profiles(id),      -- required for overland; null for tv
  token text not null unique,                       -- long random; issued and revoked in Settings
  home_network_only boolean not null default true,  -- tv: checked by the proxy against the home IP range
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

-- ---------- RLS ----------
alter table public.calendar_events enable row level security;
alter table public.day_blocks enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.locations enable row level security;
alter table public.messages_threads enable row level security;
alter table public.messages enable row level security;
alter table public.assistant_confirmations enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.shop_cases enable row level security;
alter table public.voice_calls enable row level security;
alter table public.device_tokens enable row level security;

-- shared: members read
create policy "members read calendar"   on public.calendar_events for select using (public.is_member());
create policy "members read checklists" on public.checklists      for select using (public.is_member() and (person is null or person = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','member'))));
create policy "members read items"      on public.checklist_items for select using (public.is_member());
create policy "members read carts"      on public.carts           for select using (public.is_member());
create policy "members read cart items" on public.cart_items      for select using (public.is_member());
create policy "members read orders"     on public.orders          for select using (public.is_member());
create policy "members read cases"      on public.shop_cases      for select using (public.is_member());
create policy "members read calls"      on public.voice_calls     for select using (public.is_member());

-- person-private: the owner only (location, own threads, own confirmations, own day blocks)
create policy "owner reads own day"           on public.day_blocks              for select using (person = auth.uid());
create policy "owner reads own locations"     on public.locations               for select using (person = auth.uid());
create policy "owner reads own threads"       on public.messages_threads        for select using (person = auth.uid());
create policy "owner reads own messages"      on public.messages                for select using (person = auth.uid());
create policy "owner reads own confirmations" on public.assistant_confirmations for select using (person = auth.uid());
-- device tokens are never readable from the browser; Settings issues them through a server action with the service role.

-- browser writes the requirements allow (tier 1 and 2 actions on the person's own things or shared carts)
create policy "owner answers own day"      on public.day_blocks for update using (person = auth.uid()) with check (person = auth.uid());
create policy "owner answers own question" on public.locations  for update using (person = auth.uid()) with check (person = auth.uid() and status in ('answered','private','question'));
create policy "owner ticks items"          on public.checklist_items for update using (public.is_member()) with check (true);
create policy "owner adds items"           on public.checklist_items for insert with check (public.is_member());
create policy "owner answers confirmation" on public.assistant_confirmations for update using (person = auth.uid()) with check (status in ('yes','no'));
create policy "parents edit carts"         on public.cart_items for all using (public.is_member()) with check (public.is_member());
create policy "parent marks received"      on public.orders for update using (public.is_member()) with check (status in ('received','problem','delivered'));
create policy "parent resolves case"       on public.shop_cases for update using (public.is_member()) with check (true);
create policy "parent approves call"       on public.voice_calls for update using (public.is_member()) with check (status in ('approved','declined','done'));

-- Retention jobs (run by the Mac mini agents with the service role; recorded here so the rule is in one place):
--   delete from public.locations where recorded_at < now() - interval '30 days';
--   delete from public.messages  where at          < now() - interval '30 days';
