-- Subscriptions tracked from several sources (receipt emails, notice emails, card charges, store receipts, manual).
-- recurring_items (0003) stays the register the Subscriptions page reads. This adds:
--   1. a few columns on recurring_items so a subscription found by the mail agent can be tracked and explained, and
--   2. recurring_observations: an append-only list of every sighting (what, when, how much, where), so a change
--      (new amount, price-change notice, cycle change, duplicate, missing charge) can be detected and shown with proof.
-- Nothing is ever deleted: observations cannot be updated or deleted (a correction is a new row); a subscription is
-- ended by status, not by removing the row. Writes come from the service role (Mac mini agent); members read.

alter table public.recurring_items
  add column if not exists merchant_key text,                       -- stable id for the merchant, e.g. "anthropic" (sender domain family)
  add column if not exists category text,                           -- software, hosting, AI tools ...; set by a rule or an answer
  add column if not exists status text not null default 'active' check (status in ('active','paused','cancelled')),
  add column if not exists first_seen date,
  add column if not exists last_seen date,
  add column if not exists last_amount numeric,                     -- the most recent amount actually seen (compared with amount)
  add column if not exists created_by text not null default 'System (register)';
create unique index if not exists recurring_items_merchant_key_idx on public.recurring_items(merchant_key) where merchant_key is not null;

create table public.recurring_observations (
  id uuid primary key default gen_random_uuid(),
  recurring_id uuid references public.recurring_items(id),          -- null until the sighting is matched to a subscription
  merchant_key text not null,
  source text not null check (source in ('receipt','notice','charge','store_receipt','manual')),
  signal text not null default 'charge' check (signal in ('charge','price_change','renewal_notice','trial_ending','payment_failed','cancelled','other')),
  observed_on date not null,
  amount numeric,
  cycle_hint text check (cycle_hint in ('weekly','monthly','yearly')),
  ref text,                                                         -- link to the email or transaction; never contents
  mailbox text,                                                     -- which account it was seen in
  created_at timestamptz not null default now()
);
create index recurring_observations_merchant_idx on public.recurring_observations(merchant_key, observed_on desc);
create unique index recurring_observations_ref_idx on public.recurring_observations(source, ref) where ref is not null;  -- re-runs add nothing twice

alter table public.recurring_observations enable row level security;
create policy "members read recurring observations" on public.recurring_observations for select using (public.is_member());

-- Append-only, enforced for everyone including the service role.
create or replace function public.recurring_observations_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'recurring_observations is append-only: add a new row instead of changing or deleting one';
end $$;
create trigger recurring_observations_no_change before update or delete on public.recurring_observations
  for each row execute function public.recurring_observations_append_only();
