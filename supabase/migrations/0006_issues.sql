-- Problem reports from inside the app. One row per report. Status is moved by the
-- maintainer (service role), never from the browser. This table has the shape the
-- fleet service will later read (scrubbed): no record contents are stored here, only
-- the reporter's words and the item's kind and id.

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references public.profiles(id),
  reporter_name text,
  text text not null,                                   -- the person's one line
  severity text not null default 'annoying' check (severity in ('blocks','annoying','cosmetic','idea')),
  page text not null,                                   -- pathname where the report was made
  item_kind text,                                       -- 'task' | 'record' | 'receipt' | ... (optional)
  item_id text,                                         -- id only, never contents
  app_version text,                                     -- git sha or tag of the running build
  user_agent text,
  viewport text,                                        -- "390x780"
  doctor jsonb,                                         -- last doctor result, when the doctor exists
  status text not null default 'open' check (status in ('open','needs_info','fixed','cannot_reproduce','by_design','duplicate')),
  status_note text,                                     -- maintainer's note shown to the reporter
  fixed_in text,                                        -- version that carries the fix
  duplicate_of uuid references public.issues(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index issues_status_idx on public.issues(status, created_at desc);
create index issues_reporter_idx on public.issues(reported_by, created_at desc);

alter table public.issues enable row level security;

-- Every member can read every report (a household shares its problems) and file their own.
create policy "members read issues" on public.issues for select using (public.is_member());
create policy "member files own issue" on public.issues for insert with check (public.is_member() and reported_by = auth.uid());
-- The reporter may add to their own text while the issue is still open; status fields stay with the service role.
create policy "reporter edits own open issue" on public.issues for update
  using (reported_by = auth.uid() and status = 'open')
  with check (reported_by = auth.uid() and status = 'open');
