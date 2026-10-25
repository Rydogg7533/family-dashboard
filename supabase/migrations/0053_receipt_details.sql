-- Receipt details (2026-10-25). Applied live with apply_migration "receipt_details".
-- add_read_details: adds Covers / Period / Reference to an Inbox item's read_result in ONE atomic merge, only when they are not there yet,
-- so reading older items can never overwrite an answer someone is giving at the same moment (paid_with, plan, options...). Runs as the caller (RLS applies).
create or replace function public.add_read_details(p_id uuid, p_covers text, p_period text, p_reference text)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.inbox_items
     set read_result = read_result || jsonb_build_object('covers', p_covers, 'period', p_period, 'reference', p_reference)
   where id = p_id and read_result is not null and jsonb_typeof(read_result) = 'object' and not (read_result ? 'covers');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.add_read_details(uuid, text, text, text) from public, anon;
grant execute on function public.add_read_details(uuid, text, text, text) to authenticated;
