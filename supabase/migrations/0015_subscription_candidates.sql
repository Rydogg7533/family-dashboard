-- Possible subscriptions found in mail, and the answer to each.
-- The mail agent (service role) writes one row per merchant it sees receipts from, with hints (count, dates, amount, cycle).
-- A person answers in the app: "it is a subscription" (creates the recurring_items row) or "not a subscription" (the agent never asks again).
-- Nothing is deleted. The row keeps the answer, who gave it and when.

create table public.subscription_candidates (
  id uuid primary key default gen_random_uuid(),
  merchant_key text not null unique,                        -- sender domain family, e.g. "anthropic"; same key as recurring_items.merchant_key
  name text not null,                                       -- as the sender calls itself, e.g. "Anthropic, PBC"
  address text,                                             -- a sender address the receipts come from
  domain text,
  mailbox text,                                             -- which Gmail account saw them
  task_merge_key text,                                      -- the "Subscription?" task for this merchant, so the task page can show the form
  receipt_count integer not null default 0,
  first_seen date,
  last_seen date,
  amount_hint numeric,                                      -- newest amount visible in a receipt subject or preview; a suggestion, never a fact
  cycle_hint text check (cycle_hint in ('weekly','monthly','yearly')),
  status text not null default 'asking' check (status in ('asking','subscription','not_subscription')),
  recurring_id uuid references public.recurring_items(id),
  answered_by text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscription_candidates enable row level security;
create policy "members read candidates" on public.subscription_candidates for select to authenticated using (public.is_member());
create policy "members answer candidates" on public.subscription_candidates for update to authenticated using (public.is_member()) with check (public.is_member());

-- A member adding a subscription from the app (a decision to cancel or downgrade still goes through the two-party flow).
create policy "members add recurring" on public.recurring_items for insert to authenticated with check (public.is_member());
