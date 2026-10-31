-- Run after every migration (Supabase SQL editor or execute_sql). Tries the writes the app makes when a statement is filed, as a signed-in
-- household member, then rolls everything back by raising on purpose. Success looks like an error that starts with PROBE_OK.
-- Any other message is a missing grant or policy, found before a person taps anything. (0105 shipped without UPDATE; this would have said so.)
do $$
declare uid uuid; iid uuid; aid text;
begin
  select id into uid from public.profiles where role <> 'child' limit 1;
  select id into iid from public.inbox_items where read_result ? 'statement_account' and status='open' limit 1;
  select id into aid from public.accounts where retired_at is null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.account_statements (account_id, period, inbox_id, name, filed_by) values (aid, '1999-01', iid, 'probe', 'probe')
    on conflict (inbox_id) do update set name = excluded.name;
  insert into public.account_statements (account_id, period, inbox_id, name, filed_by) values (aid, '1999-01', iid, 'probe again', 'probe')
    on conflict (inbox_id) do update set name = excluded.name;
  raise exception 'PROBE_OK: insert and upsert-update both allowed as a member';
end $$;
