-- 0064_task_reviews.sql
-- One verdict per task: was the task right to exist at all? Triage has made 75 tasks from email
-- (35 decide, 30 do, 10 reply) and nobody has ever judged them, so "is triage reliable" -- the
-- condition Ryan put on scheduling it (decisions log 2026-10-26i, D103/D105) -- has no evidence
-- behind it. This table is that evidence.
--
-- It deliberately does NOT touch tasks.status. A verdict is a judgment about whether the task
-- should have been made; the task's own queue state is separate and stays as the person left it.
-- Marking a task "not a task" here does not dismiss it, and dismissing it there does not judge it.
--
-- `scope` records what D98b requires of every answer: does it settle this one item ('once') or the
-- pattern behind it ('every_time'). Nothing enforces 'every_time' yet, and the UI promises nothing:
-- no triage script reads any rules table (verified 2026-10-26 -- email_rules has two writers and no
-- reader), and the sender is not even on the task for 62 of the 75 (their mail aged out of the
-- 300-per-account inbox cap, D51). So this column is the seed a rule builder will read later, not a
-- filter that runs today.
create table public.task_reviews (
  task uuid primary key references public.tasks(id) on delete cascade,
  verdict text not null check (verdict in ('right', 'not_a_task', 'wrong_type')),
  scope text not null default 'once' check (scope in ('once', 'every_time')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_by_name text,
  at timestamptz not null default now()
);

comment on table public.task_reviews is
  'Was this task right to exist? One row per task, re-tappable. Never changes tasks.status.';
comment on column public.task_reviews.scope is
  'once = settles this item; every_time = the pattern is wrong. A seed for rule building; nothing enforces it yet.';

alter table public.task_reviews enable row level security;

create policy "members read task reviews" on public.task_reviews
  for select to authenticated using (public.is_member());
create policy "members add task reviews" on public.task_reviews
  for insert to authenticated with check (public.is_member());
create policy "members change task reviews" on public.task_reviews
  for update to authenticated using (public.is_member()) with check (public.is_member());

create index task_reviews_verdict_idx on public.task_reviews (verdict);
