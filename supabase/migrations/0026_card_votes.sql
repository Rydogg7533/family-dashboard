-- Card evidence (D70): each source votes for the card a receipt was charged to; the best vote sets receipts.card.
-- Sources, strongest first: statement (a bank/statement line) > you (a tap) > alert (card-alert email) > receipt_text (last four printed on it).
-- Votes agreeing raises nothing silently; disagreeing sets card_conflict so a person looks. Votes are never deleted.
create table if not exists public.card_votes (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id),
  source text not null check (source in ('statement','you','alert','receipt_text')),
  card text not null,
  confidence text not null check (confidence in ('high','medium')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.card_votes enable row level security;
create policy "members read card votes" on public.card_votes for select using (public.is_member());
alter table public.receipts add column if not exists card_confidence text, add column if not exists card_conflict boolean not null default false;

create or replace function public.record_card_vote(p_receipt uuid, p_source text, p_card text, p_conf text)
returns void language plpgsql security definer set search_path = '' as $$
declare best record; keys int;
begin
  if auth.uid() is not null and not public.is_member() then raise exception 'not a member'; end if;
  insert into public.card_votes (receipt_id, source, card, confidence, created_by) values (p_receipt, p_source, btrim(p_card), p_conf, auth.uid());
  -- the same card whatever the spelling: last four digits when there are any, else the lowercase name
  select count(distinct case when length(regexp_replace(card, '\D', '', 'g')) >= 4 then right(regexp_replace(card, '\D', '', 'g'), 4) else lower(card) end) into keys from public.card_votes where receipt_id = p_receipt;
  select card, confidence into best from public.card_votes where receipt_id = p_receipt
    order by array_position(array['statement','you','alert','receipt_text'], source), created_at desc limit 1;
  update public.receipts set card = best.card, card_confidence = case when best.confidence = 'high' then 'high' else 'medium' end, card_conflict = keys > 1 where id = p_receipt;
end $$;
revoke all on function public.record_card_vote(uuid, text, text, text) from public, anon;
grant execute on function public.record_card_vote(uuid, text, text, text) to authenticated, service_role;
