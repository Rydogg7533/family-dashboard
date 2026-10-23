-- Push for task hand-overs, new assignments and heads-ups (F23). A person is notified only when someone ELSE changes a task
-- they are on, and the message always says who. Writes with no signed-in person (the Mac mini agents, warranty and claim
-- reminders) queue nothing: those tasks appear on Today and the weekly review without a buzz. Closing or dismissing the task
-- retracts the banner through the existing tasks_retract trigger (item_kind 'tasks', item_id = task id).
create or replace function public.notify_task_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  who text;
  assigned uuid[] := '{}';
  headsup uuid[] := '{}';
  r uuid;
  verb text;
begin
  if actor is null or new.status <> 'open' then return new; end if;
  select display_name into who from public.profiles where id = actor;
  who := coalesce(who, 'Someone');

  if tg_op = 'INSERT' then
    if new.person is not null then assigned := assigned || new.person; end if;
    if new.audience = 'both' then assigned := assigned || array(select id from public.profiles); end if;
    headsup := new.fyi;
    verb := 'added a task for';
  else
    if new.person is distinct from old.person and new.person is not null then assigned := assigned || new.person; end if;
    if new.audience = 'both' and old.audience is distinct from 'both' then assigned := assigned || array(select id from public.profiles); end if;
    headsup := array(select x from unnest(new.fyi) x where not (x = any (old.fyi)));
    verb := 'handed';
  end if;

  assigned := array(select distinct x from unnest(assigned) x where x <> actor);
  headsup := array(select distinct x from unnest(headsup) x where x <> actor and not (x = any (assigned)));

  foreach r in array assigned loop
    insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
    values (r, 'task', 'push',
            case when verb = 'handed' then who || ' handed you a task' when new.audience = 'both' then who || ' added a task for both of you' else who || ' added a task for you' end,
            new.title, '/tasks', 'tasks:' || new.id || ':' || extract(epoch from now())::bigint, 'tasks', new.id::text);
  end loop;
  foreach r in array headsup loop
    insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
    values (r, 'task_fyi', 'push', who || ' is giving you a heads-up', new.title, '/tasks',
            'tasks:' || new.id || ':' || extract(epoch from now())::bigint, 'tasks', new.id::text);
  end loop;
  return new;
end $$;

-- A trigger function is never called directly.
revoke all on function public.notify_task_change() from public, anon, authenticated;

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update of person, audience, fyi on public.tasks
  for each row execute function public.notify_task_change();
