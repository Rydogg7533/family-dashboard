-- Payment cards (D-2026-10-27): every card is a row tied to exactly one account (the thing that owes a statement).
-- A debit card must point at a checking/savings account; a credit card at a credit/business account; a wallet at a payment app.
-- The same credit account can carry a physical card and a virtual one (Apple Card: the titanium card and the Wallet number
-- have different last-fours). Receipts point at the card that paid, so the display can read "card → account".
-- Last four only, never full numbers. Cards are retired or replaced, never deleted.
-- Applied live 2026-10-27 as payment_cards_a (table, columns, RLS) and payment_cards_b (functions, triggers).
create table if not exists public.payment_cards (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts(id),
  form text not null check (form in ('physical','virtual')),
  network text,                                        -- Visa, Mastercard, Amex, Discover
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  label text,                                          -- "Apple Wallet", "wallet card", "Melissa's card"
  holder text,                                         -- whose name is on it
  twin_of uuid references public.payment_cards(id),    -- the other form of the same card (physical <-> virtual)
  replaced_by uuid references public.payment_cards(id),-- set when reissued; old receipts keep pointing at this row
  retired_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists payment_cards_account_last4 on public.payment_cards(account_id, last4) where retired_at is null;
create index if not exists payment_cards_last4 on public.payment_cards(last4);

-- The account's kind decides what the card is: no separate "debit"/"credit" column can disagree with the account.
create or replace function public.payment_card_kind(p_account_kind text) returns text language sql immutable as $$
  select case when p_account_kind in ('checking','savings') then 'debit' when p_account_kind in ('credit','business') then 'credit' else 'wallet' end
$$;

-- A twin must be the other form on the same account.
create or replace function public.payment_cards_check() returns trigger language plpgsql set search_path = '' as $$
declare t record;
begin
  if new.twin_of is not null then
    select account_id, form into t from public.payment_cards where id = new.twin_of;
    if t is null then raise exception 'twin card not found'; end if;
    if t.account_id <> new.account_id then raise exception 'a twin must be on the same account'; end if;
    if t.form = new.form then raise exception 'a twin must be the other form (physical/virtual)'; end if;
  end if;
  return new;
end $$;
create trigger payment_cards_check before insert or update on public.payment_cards for each row execute function public.payment_cards_check();

-- Receipts point at the card that paid (or an account for ACH / checks with no card).
alter table public.receipts add column if not exists paid_with_card_id uuid references public.payment_cards(id);
alter table public.receipts add column if not exists paid_with_account_id text references public.accounts(id);

-- Resolve a card label ("Amex 1004", "Visa ••7703") to one card row by its last four; null when none or ambiguous.
create or replace function public.card_for_label(p_label text) returns uuid language sql stable set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(id))[1] end from public.payment_cards
  where retired_at is null and length(regexp_replace(p_label, '\D', '', 'g')) >= 4 and last4 = right(regexp_replace(p_label, '\D', '', 'g'), 4)
$$;

-- record_card_vote now also sets receipts.paid_with_card_id from the winning vote.
create or replace function public.record_card_vote(p_receipt uuid, p_source text, p_card text, p_conf text)
returns void language plpgsql security definer set search_path = '' as $$
declare best record; keys int;
begin
  if auth.uid() is not null and not public.is_member() then raise exception 'not a member'; end if;
  insert into public.card_votes (receipt_id, source, card, confidence, created_by) values (p_receipt, p_source, btrim(p_card), p_conf, auth.uid());
  select count(distinct case when length(regexp_replace(card, '\D', '', 'g')) >= 4 then right(regexp_replace(card, '\D', '', 'g'), 4) else lower(card) end) into keys from public.card_votes where receipt_id = p_receipt;
  select card, confidence into best from public.card_votes where receipt_id = p_receipt
    order by array_position(array['statement','you','alert','receipt_text'], source), created_at desc limit 1;
  update public.receipts set card = best.card, card_confidence = case when best.confidence = 'high' then 'high' else 'medium' end, card_conflict = keys > 1,
    paid_with_card_id = public.card_for_label(best.card) where id = p_receipt;
end $$;

-- A newly listed card claims the receipts already labeled with its last four (only those not yet tied to a card).
create or replace function public.payment_cards_link_receipts() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.receipts set paid_with_card_id = new.id
  where paid_with_card_id is null and card is not null and right(regexp_replace(card, '\D', '', 'g'), 4) = new.last4
    and public.card_for_label(card) = new.id;
  return new;
end $$;
create trigger payment_cards_link_receipts after insert on public.payment_cards for each row execute function public.payment_cards_link_receipts();

alter table public.payment_cards enable row level security;
create policy "members read payment cards" on public.payment_cards for select to authenticated using (public.is_member());
create policy "owners add payment cards" on public.payment_cards for insert to authenticated with check (public.is_owner());
create policy "owners edit payment cards" on public.payment_cards for update to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update on public.payment_cards to authenticated;
grant all on public.payment_cards to service_role;
