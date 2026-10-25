-- One standing task per person: "Name N places". N is the number of unnamed places in the Places list ("Seen, not named yet").
-- The count is computed by the caller (the location agent every 10 minutes, and the app right after a place is named, hidden or skipped);
-- this function owns the task rules so the two callers cannot disagree.
--   count 0   -> an open or snoozed task is marked done
--   count > 0 -> no task, or the last one done: a new task; an open or snoozed one: its title is updated; a dismissed one stays dismissed
-- Agent writes (no signed-in person) and a person's own writes queue no push (see notify_task_change).
create or replace function public.sync_name_places_task(p_person uuid, p_count int) returns void
language plpgsql security definer set search_path = '' as $$
declare t record; ttl text;
begin
  if auth.uid() is not null and auth.uid() <> p_person then raise exception 'not your task'; end if;
  if p_count is null or p_count < 0 then return; end if;
  select * into t from public.tasks where person = p_person and origin_kind = 'system' and origin_ref = '/places' order by created_at desc limit 1;
  ttl := 'Name ' || p_count || ' place' || case when p_count = 1 then '' else 's' end;
  if p_count = 0 then
    if found and t.status in ('open', 'snoozed') then update public.tasks set status = 'done', updated_at = now() where id = t.id; end if;
    return;
  end if;
  if not found or t.status = 'done' then
    insert into public.tasks (person, kind, title, summary, origin_kind, origin_ref, tier, audience)
    values (p_person, 'do', ttl, 'Your GPS stopped at places that are not named yet. Name them, mark them private, or skip them. The count updates as new ones appear.', 'system', '/places', 1, 'one');
  elsif t.status in ('open', 'snoozed') and t.title is distinct from ttl then
    update public.tasks set title = ttl, updated_at = now() where id = t.id;
  end if;
end $$;
revoke all on function public.sync_name_places_task(uuid, int) from public, anon;
grant execute on function public.sync_name_places_task(uuid, int) to authenticated, service_role;
