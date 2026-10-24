-- Sitter nights: a parent marks (or confirms, or tells the app about) a night a babysitter is at the house. At the leave-by time the person who set it up gets a push; the
-- review screen shows exactly what the kitchen tablet will display; after they confirm, the tablet shows it until the night ends. Nothing is deleted.
--  * sitter_sheet_items: the reusable template (contacts, kids, where things are, house notes, rules, health). Health is never on by default.
--  * sitter_sheet_sections: the guided setup task's units (each section done or skipped; contacts cannot be skipped).
--  * sitter_nights: one row per night with a snapshot of what was confirmed; `visit_only` (door codes, Wi-Fi) is cleared when the night ends.
--  * sitter_tick(): runs every minute (pg_cron): prompts at leave-by, ends nights, clears one-visit secrets.

create table if not exists public.sitter_sheet_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('contacts','kids','where','house','rules','health')),
  text text not null,
  thing_item_id uuid references public.items(id),     -- optional photo from the Things catalog
  sort int not null default 0,
  default_on boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists public.sitter_sheet_sections (
  section text primary key check (section in ('contacts','kids','where','house','rules','health')),
  state text not null default 'todo' check (state in ('todo','done','skipped')),
  updated_by text,
  updated_at timestamptz not null default now()
);
create table if not exists public.sitter_nights (
  id uuid primary key default gen_random_uuid(),
  event_key text,                                      -- '<calendar id>|<event id>' when it came from the calendar
  title text not null,
  place text,
  sitter_name text,
  starts_at timestamptz not null,
  leave_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null check (source in ('marked','detected','told')),
  status text not null default 'scheduled' check (status in ('proposed','scheduled','awaiting_review','confirmed','ended','declined','cancelled')),
  prompt_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  prompted_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  sheet jsonb not null default '[]',                   -- [{id, section, text, photo}] as confirmed
  note text,
  note_by uuid references public.profiles(id),
  note_at timestamptz,
  visit_only text,                                     -- one-visit info (door code, Wi-Fi); cleared when the night ends
  ended_at timestamptz
);
create unique index if not exists sitter_nights_event_idx on public.sitter_nights(event_key) where event_key is not null and status not in ('declined','cancelled');
create index if not exists sitter_nights_time_idx on public.sitter_nights(status, leave_at);

alter table public.sitter_sheet_items enable row level security;
alter table public.sitter_sheet_sections enable row level security;
alter table public.sitter_nights enable row level security;
create policy "members read sitter items" on public.sitter_sheet_items for select to authenticated using (public.is_member());
create policy "members add sitter items" on public.sitter_sheet_items for insert to authenticated with check (public.is_member());
create policy "members change sitter items" on public.sitter_sheet_items for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read sitter sections" on public.sitter_sheet_sections for select to authenticated using (public.is_member());
create policy "members add sitter sections" on public.sitter_sheet_sections for insert to authenticated with check (public.is_member());
create policy "members change sitter sections" on public.sitter_sheet_sections for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read sitter nights" on public.sitter_nights for select to authenticated using (public.is_member());
create policy "members add sitter nights" on public.sitter_nights for insert to authenticated with check (public.is_member());
create policy "members change sitter nights" on public.sitter_nights for update to authenticated using (public.is_member()) with check (public.is_member());
-- No delete policy on any of these tables.

-- The kitchen tablet pairs with a token like the TV does.
alter table public.device_tokens drop constraint if exists device_tokens_kind_check;
alter table public.device_tokens add constraint device_tokens_kind_check check (kind in ('overland','tv','kitchen'));
alter table public.setup_dismissals drop constraint if exists setup_dismissals_step_check;
alter table public.setup_dismissals add constraint setup_dismissals_step_check check (step in ('push','mail','calendar','location','contacts','catalog','sitter_sheet'));

-- Retract the leave-by push once the night is no longer waiting for review.
create or replace function public.retract_sitter_notifications() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'awaiting_review' and new.status <> 'awaiting_review' then
    update public.notifications set status = 'retracted', retracted_at = now() where item_kind = 'sitter_nights' and item_id = new.id::text and status in ('queued','sent');
  end if;
  return new;
end $$;
drop trigger if exists sitter_nights_retract on public.sitter_nights;
create trigger sitter_nights_retract after update on public.sitter_nights for each row execute function public.retract_sitter_notifications();

-- Every minute: prompt at leave-by, end finished nights, clear one-visit secrets. Runs as the database owner, so it can write the notification queue.
create or replace function public.sitter_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id, title, prompt_to, created_by from public.sitter_nights where status = 'scheduled' and leave_at <= now() and ends_at > now() loop
    update public.sitter_nights set status = 'awaiting_review', prompted_at = now() where id = r.id;
    if coalesce(r.prompt_to, r.created_by) is not null then
      insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
      values (coalesce(r.prompt_to, r.created_by), 'sitter', 'push', 'Time to go: check the sitter sheet', r.title, '/sitter/review/' || r.id, 'sitter:' || r.id, 'sitter_nights', r.id::text);
    end if;
  end loop;
  update public.sitter_nights set status = 'ended', ended_at = now(), visit_only = null where status in ('confirmed','awaiting_review') and ends_at <= now();
  update public.sitter_nights set status = 'cancelled' where status in ('scheduled','proposed') and ends_at <= now();
end $$;
revoke execute on function public.sitter_tick() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('sitter-tick', '* * * * *', 'select public.sitter_tick()');
