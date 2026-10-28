-- After a visit: the Today card asks "anything to remember?"; debrief_at records that it was answered or dismissed.
-- sitter_tick also stamps the sitter's last visit when a night ends.
alter table public.sitter_nights add column if not exists debrief_at timestamptz;

create or replace function public.sitter_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id, title, prompt_to, created_by from public.sitter_nights where status = 'scheduled' and leave_at <= now() and ends_at > now() loop
    update public.sitter_nights set status = 'awaiting_review', prompted_at = now() where id = r.id;
    if coalesce(r.prompt_to, r.created_by) is not null then
      insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
      values (coalesce(r.prompt_to, r.created_by), 'sitter', 'push', 'Time to go: check the sitter sheet', r.title, '/sitter/review/' || r.id, 'sitter:' || r.id, 'sitter_nights', r.id::text);
    end if;
  end loop;
  for r in select id, title, prompt_to, created_by from public.sitter_nights
           where status = 'scheduled' and prepared_at is null and prep_prompted_at is null and leave_at <= now() + interval '24 hours' and leave_at > now() + interval '2 hours' loop
    update public.sitter_nights set prep_prompted_at = now() where id = r.id;
    if coalesce(r.prompt_to, r.created_by) is not null then
      insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
      values (coalesce(r.prompt_to, r.created_by), 'sitter', 'push', 'Tomorrow''s sitter visit: pick instructions', r.title, '/sitter/review/' || r.id, 'sitter-prep:' || r.id, 'sitter_nights', r.id::text);
    end if;
  end loop;
  for r in select id, title, prompt_to, created_by from public.sitter_nights
           where status = 'scheduled' and confirm_prompted_at is null and leave_at <= now() + interval '2 hours' and leave_at > now() loop
    update public.sitter_nights set confirm_prompted_at = now() where id = r.id;
    if coalesce(r.prompt_to, r.created_by) is not null then
      insert into public.notifications (person, type, channel, title, body, url, tag, item_kind, item_id)
      values (coalesce(r.prompt_to, r.created_by), 'sitter', 'push', 'Sitter soon: confirm the sheet?', r.title, '/sitter/review/' || r.id, 'sitter-confirm:' || r.id, 'sitter_nights', r.id::text);
    end if;
  end loop;
  -- Ending: clear the one-visit secrets, stamp the sitter's last visit.
  for r in select id, sitter_person_id, ends_at from public.sitter_nights where status in ('confirmed','awaiting_review') and ends_at <= now() loop
    update public.sitter_nights set status = 'ended', ended_at = now(), visit_only = null where id = r.id;
    if r.sitter_person_id is not null then update public.sitter_people set last_visit_at = r.ends_at where id = r.sitter_person_id; end if;
  end loop;
  update public.sitter_nights set status = 'cancelled' where status in ('scheduled','proposed','needed') and ends_at <= now();
  -- ask_pending expiry is enforced when Ask reads the row (expires_at); no sweep here.
end $$;
revoke execute on function public.sitter_tick() from public, anon, authenticated;
