-- Sitter templates, approved sitters, visit drafts (spec: claude/stewardos-sitter-templates-spec-2026-10-27.md; decisions log 2026-10-27k D1–D4).
--  * sitter_templates / sitter_template_items: named instruction sets, general or per child; one default per (kind, child). Health items never on by default.
--  * sitter_people: approved sitters. Name and phone live only in contacts (D1); this row holds sitter-only notes and the approval.
--  * sitter_drafts: instructions prepared with no date yet (Ask S3), consumed when a night is created.
--  * ask_pending: the one place Ask carries state between messages (clarify cards, the add-a-sitter walkthrough); expires in 10 minutes.
--  * sitter_nights: template choices, children home, a wizard draft, the 'needed' status (no sitter found yet: no prompts, no tablet).
-- The always-on household card keeps using sitter_sheet_items; its 'kids' and 'health' sections are retired (archived, never deleted).
-- Nothing is deleted anywhere: archived_at.

create table if not exists public.sitter_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('general','child')),
  child_id uuid references public.children(id),
  name text not null,
  is_default boolean not null default false,
  sort int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((kind = 'child') = (child_id is not null))
);
create unique index if not exists sitter_templates_name_idx on public.sitter_templates(kind, coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where archived_at is null;
create unique index if not exists sitter_templates_default_idx on public.sitter_templates(kind, coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_default and archived_at is null;

create table if not exists public.sitter_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.sitter_templates(id),
  section text not null,
  text text not null,
  thing_item_id uuid references public.items(id),
  sort int not null default 0,
  default_on boolean not null default true,
  sensitivity text not null default 'normal' check (sensitivity in ('normal','health')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Health lines are off until a parent ticks them for a visit.
  check (sensitivity <> 'health' or default_on = false)
);
create index if not exists sitter_template_items_template_idx on public.sitter_template_items(template_id, sort) where archived_at is null;

-- Approved sitters: a role on a contact (D1). A household member who sits links through her contact; person_id is only the login link.
create table if not exists public.sitter_people (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id),
  person_id uuid references public.profiles(id),
  relationship text,
  age_band text check (age_band in ('adult','teen')),
  age int check (age between 10 and 120),
  rate_text text,
  drives boolean,
  children_ok uuid[],
  availability_text text,
  guardian_contact_id uuid references public.contacts(id),
  certified_text text,
  notes text,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  suggested_by uuid references public.profiles(id),
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists sitter_people_contact_idx on public.sitter_people(contact_id) where archived_at is null;

-- Instructions prepared before a date exists.
create table if not exists public.sitter_drafts (
  id uuid primary key default gen_random_uuid(),
  name text,
  general_template_id uuid references public.sitter_templates(id),
  child_templates jsonb not null default '{}',   -- {child_id: template_id}
  lines jsonb not null default '[]',             -- tonight-only lines written ahead
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  used_in_night uuid references public.sitter_nights(id),
  archived_at timestamptz
);

-- Ask's only cross-message state: a pending clarify card or walkthrough, per viewer, 10 minutes.
create table if not exists public.ask_pending (
  person uuid primary key references public.profiles(id),
  kind text not null,
  slots jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table public.sitter_nights
  add column if not exists general_template_id uuid references public.sitter_templates(id),
  add column if not exists child_templates jsonb not null default '{}',
  add column if not exists children_home uuid[],
  add column if not exists instructions_mode text check (instructions_mode in ('template','custom','blank')),
  add column if not exists draft jsonb,
  add column if not exists prepared_at timestamptz,
  add column if not exists prep_prompted_at timestamptz,
  add column if not exists confirm_prompted_at timestamptz,
  add column if not exists sitter_person_id uuid references public.sitter_people(id),
  add column if not exists pay_note text;
alter table public.sitter_nights drop constraint if exists sitter_nights_status_check;
alter table public.sitter_nights add constraint sitter_nights_status_check
  check (status in ('needed','proposed','scheduled','awaiting_review','confirmed','ended','declined','cancelled'));
-- 'needed' means no sitter yet: Today shows it, nothing prompts, the tablet stays on the clock.
drop index if exists public.sitter_nights_event_idx;
create unique index if not exists sitter_nights_event_idx on public.sitter_nights(event_key) where event_key is not null and status not in ('declined','cancelled');

-- Household card: the kids and health sections move to child templates. Rows are archived, never deleted.
alter table public.sitter_sheet_items drop constraint if exists sitter_sheet_items_section_check;
alter table public.sitter_sheet_items add constraint sitter_sheet_items_section_check check (section in ('contacts','kids','where','house','rules','health','pets'));
alter table public.sitter_sheet_items add column if not exists contact_id uuid references public.contacts(id);
alter table public.sitter_sheet_sections drop constraint if exists sitter_sheet_sections_section_check;
alter table public.sitter_sheet_sections add constraint sitter_sheet_sections_section_check check (section in ('contacts','kids','where','house','rules','health','pets'));
update public.sitter_sheet_items set archived_at = now() where section in ('kids','health') and archived_at is null;

-- Row level security: members read; members write (same as the rest of the sitter slice); approval is owner-only by trigger; no deletes.
alter table public.sitter_templates enable row level security;
alter table public.sitter_template_items enable row level security;
alter table public.sitter_people enable row level security;
alter table public.sitter_drafts enable row level security;
alter table public.ask_pending enable row level security;
create policy "members read sitter templates" on public.sitter_templates for select to authenticated using (public.is_member());
create policy "members add sitter templates" on public.sitter_templates for insert to authenticated with check (public.is_member());
create policy "members change sitter templates" on public.sitter_templates for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read sitter template items" on public.sitter_template_items for select to authenticated using (public.is_member());
create policy "members add sitter template items" on public.sitter_template_items for insert to authenticated with check (public.is_member());
create policy "members change sitter template items" on public.sitter_template_items for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read sitter people" on public.sitter_people for select to authenticated using (public.is_member());
create policy "members add sitter people" on public.sitter_people for insert to authenticated with check (public.is_member());
create policy "members change sitter people" on public.sitter_people for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read sitter drafts" on public.sitter_drafts for select to authenticated using (public.is_member());
create policy "members add sitter drafts" on public.sitter_drafts for insert to authenticated with check (public.is_member());
create policy "members change sitter drafts" on public.sitter_drafts for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "own ask pending" on public.ask_pending for all to authenticated using (person = auth.uid()) with check (person = auth.uid());
-- ask_pending is the one table here that may be deleted from (its own row, on cancel or expiry); nothing else has a delete policy.

-- Only an owner sets or clears an approval; a member's add stays a suggestion (D1, D4).
create or replace function public.sitter_people_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.approved_at is not null and not public.is_owner() then
      new.approved_at := null; new.approved_by := null;
      new.suggested_by := coalesce(new.suggested_by, auth.uid());
    elsif new.approved_at is not null then
      new.approved_by := coalesce(new.approved_by, auth.uid());
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by) and not public.is_owner() then
      raise exception 'only an owner can approve or un-approve a sitter';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sitter_people_guard on public.sitter_people;
create trigger sitter_people_guard before insert or update on public.sitter_people for each row execute function public.sitter_people_guard();

create or replace function public.sitter_templates_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists sitter_templates_touch on public.sitter_templates;
create trigger sitter_templates_touch before update on public.sitter_templates for each row execute function public.sitter_templates_touch();

-- Starters (empty, editable, archivable): three general templates with "Evening out" as default, and "Everyday" per active child as that child's default.
insert into public.sitter_templates (kind, name, is_default, sort)
select 'general', n, n = 'Evening out', s
from (values ('Evening out', 0), ('Weekday after school', 1), ('Overnight', 2)) as t(n, s)
where not exists (select 1 from public.sitter_templates where kind = 'general' and archived_at is null);
insert into public.sitter_templates (kind, child_id, name, is_default, sort)
select 'child', c.id, 'Everyday', true, 0
from public.children c
where c.archived_at is null
  and not exists (select 1 from public.sitter_templates t where t.kind = 'child' and t.child_id = c.id and t.archived_at is null);

-- Scheduler: needed and cancelled rows never prompt; T-24h prep nudge when no instructions chosen; T-2h confirm nudge when still scheduled.
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
  -- T-24h: instructions not yet chosen.
  for r in select id, title, prompt_to, created_by from public.sitter_nights
           where status = 'scheduled' and prepared_at is null and prep_prompted_at is null and leave_at <= now() + interval '24 hours' and leave_at > now() + interval '2 hours' loop
    update public.sitter_nights set prep_prompted_at = now() where id = r.id;
    if coalesce(r.prompt_to, r.created_by) is not null then
      insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
      values (coalesce(r.prompt_to, r.created_by), 'sitter', 'push', 'Tomorrow''s sitter visit: pick instructions', r.title, '/sitter/plan/' || r.id, 'sitter-prep:' || r.id, 'sitter_nights', r.id::text);
    end if;
  end loop;
  -- T-2h: still not confirmed.
  for r in select id, title, prompt_to, created_by from public.sitter_nights
           where status = 'scheduled' and confirm_prompted_at is null and leave_at <= now() + interval '2 hours' and leave_at > now() loop
    update public.sitter_nights set confirm_prompted_at = now() where id = r.id;
    if coalesce(r.prompt_to, r.created_by) is not null then
      insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
      values (coalesce(r.prompt_to, r.created_by), 'sitter', 'push', 'Sitter soon: confirm the sheet?', r.title, '/sitter/plan/' || r.id, 'sitter-confirm:' || r.id, 'sitter_nights', r.id::text);
    end if;
  end loop;
  update public.sitter_nights set status = 'ended', ended_at = now(), visit_only = null where status in ('confirmed','awaiting_review') and ends_at <= now();
  update public.sitter_nights set status = 'cancelled' where status in ('scheduled','proposed','needed') and ends_at <= now();
  delete from public.ask_pending where expires_at <= now();
end $$;
revoke execute on function public.sitter_tick() from public, anon, authenticated;

-- Retract the prep and confirm pushes once instructions are chosen or the night is confirmed.
create or replace function public.retract_sitter_notifications() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'awaiting_review' and new.status <> 'awaiting_review' then
    update public.notifications set status = 'retracted', retracted_at = now() where item_kind = 'sitter_nights' and item_id = new.id::text and tag = 'sitter:' || new.id and status in ('queued','sent');
  end if;
  if old.prepared_at is null and new.prepared_at is not null then
    update public.notifications set status = 'retracted', retracted_at = now() where item_kind = 'sitter_nights' and item_id = new.id::text and tag = 'sitter-prep:' || new.id and status in ('queued','sent');
  end if;
  if old.status in ('scheduled','proposed','needed') and new.status not in ('scheduled','proposed','needed') then
    update public.notifications set status = 'retracted', retracted_at = now() where item_kind = 'sitter_nights' and item_id = new.id::text and tag in ('sitter-prep:' || new.id, 'sitter-confirm:' || new.id) and status in ('queued','sent');
  end if;
  return new;
end $$;
