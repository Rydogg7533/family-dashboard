-- Per-child access controls, progressive by age (step 4 of people-from-the-database).
--
-- child_features: the catalog (one row per thing a child can have), with the default minimum age, whether it is sensitive (money, messages,
--   location, health, documents: needs a parent's OK) and whether it is built yet. Readable by any signed-in person; written only by migrations.
-- children.access: per-child override per feature: 'on' (a parent allowed it) or 'off' (a parent turned it off); absent = automatic by age.
-- children.paused_at: a parent paused this child's page (everything off).
-- household.child_feature_ages: a parent moved a feature to a different minimum age for the whole household.
-- child_can(feature): the rule, in the database. Sensitive features are never automatic: they need access 'on'. Age uses the youngest the
--   child could be (birth year only), so nothing opens early. Restrictive policies below make the existing own-row reads obey it for a child
--   login; parents are unaffected (not is_child()).

create table if not exists public.child_features (
  key text primary key,
  label text not null,
  description text not null,
  tier int not null check (tier between 1 and 4),
  default_min_age int not null check (default_min_age between 0 and 18),
  sensitive boolean not null default false,
  built boolean not null default false,
  sort int not null default 0
);
alter table public.child_features enable row level security;
revoke all on public.child_features from anon, authenticated;
grant select on public.child_features to authenticated;
drop policy if exists "signed-in read child features" on public.child_features;
create policy "signed-in read child features" on public.child_features for select to authenticated using (true);

insert into public.child_features (key, label, description, tier, default_min_age, sensitive, built, sort) values
 ('schedule',       'Today''s schedule',            'The child''s own schedule for today, with weather and who is driving.',                       1,  0, false, true,  10),
 ('week_calendar',  'This week''s calendar',        'Their own events and family events for the coming week.',                                     1,  0, false, true,  20),
 ('pack_lists',     'Pack lists',                    'What to bring to each activity, and ticking items off.',                                      1,  0, false, true,  30),
 ('chores',         'Chores',                        'Jobs a parent sets, with tick-off and parent approval.',                                      1,  0, false, false, 40),
 ('savings_goal',   'Savings goal',                  'A goal such as "bike: $80 of $200".',                                                         1, 10, false, false, 50),
 ('reading_log',    'Reading log',                   'Books and minutes read.',                                                                     1, 10, false, false, 60),
 ('homework',       'Homework list',                 'Assignments and due dates.',                                                                  1, 10, false, false, 70),
 ('allowance_view', 'Allowance balance (view only)', 'See the balance a parent keeps. The app never moves money.',                                  1, 10, true,  false, 80),
 ('quick_messages', 'Quick messages to parents',     'One-tap messages such as "I''m done" or "Can you pick me up?".',                              1, 10, true,  false, 90),
 ('propose_events', 'Propose calendar events',       'Suggest an event for a parent to approve.',                                                   2, 12, false, false, 100),
 ('typed_messages', 'Typed messages',                'Free-text messages to parents and parent-approved contacts.',                                 2, 12, true,  false, 110),
 ('extra_jobs',     'Extra paid jobs',               'Jobs a child can claim for pay.',                                                             2, 12, true,  false, 120),
 ('jars',           'Spend, save and give jars',     'Split allowance into jars and track spending.',                                               2, 12, true,  false, 130),
 ('checkin_location','Check-in location',            'Opt-in "I''m here" that the child can see.',                                                  2, 12, true,  false, 140),
 ('own_location',   'Own location history',          'The child''s own places and day record.',                                                     2, 12, true,  true,  150),
 ('own_tasks',      'Own tasks and reminders',       'Their own to-do list and reminders.',                                                         3, 14, false, false, 160),
 ('driving_log',    'Driving log',                   'Learner-permit hours and practice log.',                                                      3, 14, false, false, 170),
 ('budget',         'Budget',                        'Allowance and job income, categories and goal projections.',                                  3, 14, true,  false, 180),
 ('job_hours',      'Job and hours tracker',         'Hours worked and pay owed.',                                                                  3, 14, true,  false, 190),
 ('own_meds',       'Own medication reminders',      'Reminders the teen manages, visible to parents.',                                             3, 14, true,  false, 200),
 ('first_job',      'First-job checklist',           'ID, W-4 and taxes.',                                                                          4, 16, false, false, 210),
 ('vehicle_info',   'Own vehicle and insurance',     'Their own car details.',                                                                      4, 16, false, false, 220),
 ('college_tracker','College and scholarships',      'Deadlines and applications.',                                                                 4, 16, false, false, 230),
 ('bank_view',      'Teen account (read only)',      'A linked teen debit account, view only.',                                                     4, 16, true,  false, 240),
 ('own_documents',  'Own documents',                 'Copies of their ID and certificates a parent shares.',                                        4, 16, true,  false, 250)
on conflict (key) do nothing;

alter table public.children add column if not exists access jsonb not null default '{}'::jsonb;
alter table public.children add column if not exists paused_at timestamptz;
alter table public.household add column if not exists child_feature_ages jsonb not null default '{}'::jsonb;

create or replace function public.child_can(f text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case coalesce(c.access ->> f, '')
      when 'off' then false
      when 'on'  then true
      else (not cf.sensitive)
           and (extract(year from now())::int - c.birth_year - 1) >= coalesce((h.child_feature_ages ->> f)::int, cf.default_min_age)
    end
    from public.children c
    join public.child_features cf on cf.key = f
    left join public.household h on h.id = 1
    where c.profile_id = auth.uid() and c.archived_at is null and c.paused_at is null
    limit 1
  ), false);
$$;
revoke execute on function public.child_can(text) from public, anon;
grant execute on function public.child_can(text) to authenticated;

-- The 0035 child reads now obey child_can.
drop policy if exists "child reads own events" on public.calendar_events;
create policy "child reads own events" on public.calendar_events for select to authenticated
  using (public.is_child() and public.child_can('week_calendar') and (person = auth.uid() or person is null));
drop policy if exists "child reads own checklists" on public.checklists;
create policy "child reads own checklists" on public.checklists for select to authenticated
  using (public.is_child() and public.child_can('pack_lists') and person = auth.uid());
drop policy if exists "child reads own checklist items" on public.checklist_items;
create policy "child reads own checklist items" on public.checklist_items for select to authenticated
  using (public.is_child() and public.child_can('pack_lists') and exists (select 1 from public.checklists c where c.id = checklist_id and c.person = auth.uid()));
drop policy if exists "child ticks own checklist items" on public.checklist_items;
create policy "child ticks own checklist items" on public.checklist_items for update to authenticated
  using (public.is_child() and public.child_can('pack_lists') and exists (select 1 from public.checklists c where c.id = checklist_id and c.person = auth.uid()))
  with check (public.is_child() and public.child_can('pack_lists') and exists (select 1 from public.checklists c where c.id = checklist_id and c.person = auth.uid()));

-- Existing own-row policies also apply to a child login, so gate them with RESTRICTIVE policies (all permissive AND all restrictive must pass).
drop policy if exists "child schedule gate" on public.day_blocks;
create policy "child schedule gate" on public.day_blocks as restrictive for all to authenticated
  using (not public.is_child() or public.child_can('schedule')) with check (not public.is_child() or public.child_can('schedule'));
drop policy if exists "child location gate" on public.locations;
create policy "child location gate" on public.locations as restrictive for all to authenticated
  using (not public.is_child() or public.child_can('own_location')) with check (not public.is_child() or public.child_can('own_location'));
drop policy if exists "child stops gate" on public.location_stops;
create policy "child stops gate" on public.location_stops as restrictive for all to authenticated
  using (not public.is_child() or public.child_can('own_location')) with check (not public.is_child() or public.child_can('own_location'));
