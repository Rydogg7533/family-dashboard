-- Task sharing. audience 'one' = the assignee is responsible; 'both' = either parent may finish it and it closes for both.
-- fyi = people who get a heads-up copy (they may take it over). done_by records who closed it.
alter table public.tasks
  add column if not exists audience text not null default 'one' check (audience in ('one','both')),
  add column if not exists fyi uuid[] not null default '{}',
  add column if not exists done_by text;
drop policy if exists "owner updates own task" on public.tasks;
create policy "members update their tasks" on public.tasks for update
  using (public.is_member() and (person = auth.uid() or person is null or audience = 'both' or auth.uid() = any(fyi)))
  with check (status in ('open','done','snoozed','dismissed'));
