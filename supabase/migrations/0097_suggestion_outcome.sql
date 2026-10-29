-- One call records what happened to a chip and moves the person's bar for that kind: taken lowers it 0.03,
-- ignored raises it 0.04, within [0.55, 0.97]. Security definer so members never write suggestion_bars directly.
create or replace function public.suggestion_outcome(sid uuid, outcome text) returns void
language plpgsql security definer set search_path = public as $$
declare s record; cur numeric;
begin
  if outcome not in ('taken','ignored') then raise exception 'outcome must be taken or ignored'; end if;
  select * into s from public.message_suggestions where id = sid and person = auth.uid() and status in ('shown','hidden');
  if s is null then return; end if;
  update public.message_suggestions set status = outcome, decided_at = now() where id = sid;
  insert into public.suggestion_bars (person, kind) values (auth.uid(), s.kind) on conflict do nothing;
  select bar into cur from public.suggestion_bars where person = auth.uid() and kind = s.kind;
  update public.suggestion_bars set
    bar = least(0.97, greatest(0.55, round(cur + case when outcome = 'taken' then -0.03 else 0.04 end, 2))),
    taken = taken + (outcome = 'taken')::int, ignored = ignored + (outcome = 'ignored')::int, updated_at = now()
    where person = auth.uid() and kind = s.kind;
end $$;
revoke all on function public.suggestion_outcome(uuid, text) from public;
grant execute on function public.suggestion_outcome(uuid, text) to authenticated;
