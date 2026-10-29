-- Mail: archive a mailing-list sender in the dashboard only (decisions 2026-10-28 D16, D18).
-- Archive hides the sender (and, later, its messages in the reader) from the dashboard. It never touches Gmail and never
-- changes the unsubscribe status. Per sender, reversible. The unsubscribe agent archives a sender when it reports 'done'.

alter table public.email_subscriptions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.email_subscriptions.archived_at is 'Hidden in the dashboard by the person (or by the unsubscribe agent on done). Gmail untouched. null = shown.';

create index if not exists email_subscriptions_archived_idx on public.email_subscriptions (person, archived_at) where deleted_at is null;

-- The app may only set active/requested through the row policy (0073), so archiving a done or stopped row goes through
-- a function that changes nothing but archived_at/archived_by, on the caller's own rows.
create or replace function public.email_subscriptions_archive(ids uuid[], archive boolean)
returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.email_subscriptions
       set archived_at = case when archive then now() else null end,
           archived_by = case when archive then auth.uid() else null end,
           updated_at = now()
     where id = any(ids)
       and person = auth.uid()
       and deleted_at is null
       and is_member()
       and (archived_at is null) = archive
    returning id)
  select count(*)::integer from upd;
$$;

revoke all on function public.email_subscriptions_archive(uuid[], boolean) from public;
grant execute on function public.email_subscriptions_archive(uuid[], boolean) to authenticated;
