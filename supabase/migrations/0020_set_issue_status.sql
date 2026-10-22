-- Owners can set a report's status from the app (System health › Your reports). The issues table itself stays closed to
-- status edits (0006); this function is the only door, it checks is_owner(), and it touches only the four status fields.
create or replace function public.set_issue_status(p_id uuid, p_status text, p_note text, p_fixed_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'owners only'; end if;
  if p_status not in ('open','needs_info','fixed','cannot_reproduce','by_design','duplicate') then raise exception 'bad status'; end if;
  update public.issues set status = p_status, status_note = nullif(left(p_note, 500), ''), fixed_in = nullif(left(p_fixed_in, 40), ''), updated_at = now() where id = p_id;
  if not found then raise exception 'no such report'; end if;
end $$;
revoke all on function public.set_issue_status(uuid, text, text, text) from public, anon;
grant execute on function public.set_issue_status(uuid, text, text, text) to authenticated;
