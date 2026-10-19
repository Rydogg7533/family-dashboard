-- F24: one item, one state. Notifications link to their item and can be retracted; the sender pushes a silent
-- {close: tag} for retracted rows so the phone removes the notification.
alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check check (status in ('queued','sent','failed','retracted'));
alter table public.notifications add column item_kind text, add column item_id text, add column retracted_at timestamptz, add column retract_pushed_at timestamptz;
create index notifications_item_idx on public.notifications(item_kind, item_id);

-- Merge key for duplicates arriving from two sources (person + thing + date), kept on the queue tables.
alter table public.tasks add column merge_key text, add column origins jsonb not null default '[]';
create index tasks_merge_idx on public.tasks(merge_key) where merge_key is not null;
alter table public.assistant_confirmations add column merge_key text, add column origins jsonb not null default '[]';

-- When a confirmation or task leaves the open state, retract its notifications.
create or replace function public.retract_item_notifications() returns trigger
language plpgsql set search_path = public as $$
begin
  if (tg_table_name = 'tasks' and new.status <> 'open' and old.status = 'open')
     or (tg_table_name = 'assistant_confirmations' and new.status <> 'waiting' and old.status = 'waiting') then
    update public.notifications set status = 'retracted', retracted_at = now()
      where item_kind = tg_table_name and item_id = new.id::text and status in ('queued','sent');
  end if;
  return new;
end $$;
create trigger tasks_retract after update on public.tasks for each row execute function public.retract_item_notifications();
create trigger confirmations_retract after update on public.assistant_confirmations for each row execute function public.retract_item_notifications();
