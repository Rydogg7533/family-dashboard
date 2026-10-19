-- Slice A: registers (vehicles, devices, medications, contacts, home items,
-- places), per-person settings, the Sources list, and F23 notifications.
-- Reads: members (public.is_member() from 0001). Person-private tables
-- (medications, places, push_subscriptions, notifications) are readable only
-- by that person, or by an owner for medications. Writes from the browser only
-- where the requirements allow; everything else via the service role.

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

-- Every register row says who added it ("Always say who").
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- "2016 Chevrolet Tahoe"
  short text not null,                -- "Tahoe"
  year int, make text, model text,
  plate text,                         -- shown as-is (not sensitive); VIN pointer only
  vin_pointer text,                   -- 1Password item name, never the VIN
  driver uuid references public.profiles(id),
  mileage int, mileage_at date, mileage_estimated boolean not null default false,
  expiries jsonb not null default '[]',      -- [{label,date,kind,action,source,href}]
  maintenance jsonb not null default '[]',   -- [{item,dueDate,dueMiles,lastDone}]
  documents jsonb not null default '[]',     -- [{name,vault,href}] names only
  reminders jsonb not null default '[]',
  links jsonb not null default '[]',
  status text not null default 'active' check (status in ('active','sold','retired')),
  added_by text not null,             -- "Ryan · from Settings · 2026-10-18"
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  person uuid references public.profiles(id),   -- null = household
  name text not null, kind text not null, make text,
  status text not null default 'in use' check (status in ('in use','spare','loaned','for sale','retired','lost')),
  serial_last4 text, serial_pointer text,       -- last digits + where the full number lives
  purchase_date date, receipt_ref text,
  warranty_end date, plan_name text, plan_end date,
  subscription text, login_pointer text, note text,
  open_in jsonb,                                 -- {label, href}
  added_by text not null, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index devices_person_idx on public.devices(person);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  name text not null, strength text, dose text, times text[] not null default '{}',
  doctor text, pharmacy text, pharmacy_href text,
  refills_remaining int, refill_due date, start_date date, end_date date,
  reminders boolean not null default false, instructions text,
  prescription_pointer text,                     -- 1Password item name, never the Rx number
  finished boolean not null default false,
  added_by text not null, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medications_person_idx on public.medications(person);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null, kind text not null, reach text,
  registers text[] not null default '{}', notes text,
  open_in jsonb, added_by text not null, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.home_items (
  id uuid primary key default gen_random_uuid(),
  name text not null, system text not null,
  installed date, last_service date, next_due date, company text,
  open_in jsonb, added_by text not null, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  name text not null, meaning text, indoors boolean, usual_activity text,
  visits int not null default 0, shared boolean not null default false,
  added_by text not null, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index places_person_idx on public.places(person);

-- Per-person settings: appearance (F8.A), modules (F13), notification_prefs (F23).
create table public.person_settings (
  person uuid primary key references public.profiles(id) on delete cascade,
  appearance jsonb not null default '{}',
  modules jsonb not null default '{}',
  notification_prefs jsonb not null default '{}',   -- {matrix:{type:channel}, quietStart, quietEnd, morningTime, weeklyDay, weeklyTime}
  updated_by text,
  updated_at timestamptz not null default now()
);

-- The Sources page (F14): the source register in button form.
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  "group" text not null,
  name text not null, account text, reads text,
  last_synced text, status text not null default 'ok' check (status in ('ok','warn','error')),
  cadence text, href text not null, syncable boolean not null default true,
  added_by text not null, sort_order int not null default 100,
  updated_at timestamptz not null default now()
);

-- F23: one row per person per device; the Mac mini sender reads these.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,                -- {p256dh, auth}
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_person_idx on public.push_subscriptions(person);

-- F23: the queue. Payload fields only; the sender fills sent_at.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  type text not null,                 -- morning, confirm, receipt, needed, money, safety, system, other, test
  channel text not null check (channel in ('push','messages','today')),
  title text not null, body text, url text, tag text,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_queue_idx on public.notifications(status, queued_at);
create index notifications_person_idx on public.notifications(person, queued_at desc);

-- RLS
alter table public.vehicles enable row level security;
alter table public.devices enable row level security;
alter table public.medications enable row level security;
alter table public.contacts enable row level security;
alter table public.home_items enable row level security;
alter table public.places enable row level security;
alter table public.person_settings enable row level security;
alter table public.sources enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

create policy "members read vehicles"   on public.vehicles   for select using (public.is_member());
create policy "members read devices"    on public.devices    for select using (public.is_member());
create policy "members read contacts"   on public.contacts   for select using (public.is_member());
create policy "members read home"       on public.home_items for select using (public.is_member());
create policy "members read sources"    on public.sources    for select using (public.is_member());

-- Private per person: medications (an owner may also read, for the children's sections).
create policy "own or owner reads medications" on public.medications for select
  using (public.is_member() and (person = auth.uid() or public.is_owner()));
create policy "own writes medications" on public.medications for insert with check (person = auth.uid());
create policy "own updates medications" on public.medications for update using (person = auth.uid());

-- Private per person: places (shared ones visible to members).
create policy "own reads places" on public.places for select
  using (public.is_member() and (person = auth.uid() or shared));
create policy "own updates places" on public.places for update using (person = auth.uid());

-- Own settings, read and write.
create policy "own reads settings"  on public.person_settings for select using (person = auth.uid());
create policy "own writes settings" on public.person_settings for insert with check (person = auth.uid());
create policy "own updates settings" on public.person_settings for update using (person = auth.uid());

-- A person reads and inserts their own subscriptions (and may remove one).
create policy "own reads subscriptions"   on public.push_subscriptions for select using (person = auth.uid());
create policy "own inserts subscriptions" on public.push_subscriptions for insert with check (person = auth.uid());
create policy "own updates subscriptions" on public.push_subscriptions for update using (person = auth.uid());
create policy "own deletes subscriptions" on public.push_subscriptions for delete using (person = auth.uid());

-- Members read their own notifications; "Send me a test" inserts one for themselves.
create policy "own reads notifications"   on public.notifications for select using (public.is_member() and person = auth.uid());
create policy "own queues test"           on public.notifications for insert with check (person = auth.uid() and type = 'test');

-- The driver may update mileage on their own vehicle; the other parent may not (takes over via a task instead).
create policy "driver updates vehicle" on public.vehicles for update using (driver = auth.uid());
