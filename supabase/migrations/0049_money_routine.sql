-- The monthly money routine: the recurring human steps (register) and each month's record of them (runs).
-- Steps are retired, never deleted. Runs are never deleted; a done or skipped step can be reopened (status back to open) with who and when kept in the row.
-- Applied live 2026-10-24 (apply_migration "money_routine") with the seed rows below; the per-account statement steps were made from public.accounts at that time.
create table if not exists public.money_routine_steps (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  detail text,
  cadence text not null default 'monthly' check (cadence in ('monthly','quarterly','yearly','per_statement')),
  anchor_day int check (anchor_day between 1 and 28),
  account_id text references public.accounts(id),
  owner text not null default 'either' check (owner in ('Ryan','Melissa','either')),
  href text,
  source text not null default 'planned' check (source in ('planned','stated','observed')),
  evidence_rule text,
  sort int not null default 100,
  created_by text not null default 'System (seed)',
  created_at timestamptz not null default now(),
  retired_at timestamptz, retired_by text, retired_why text
);
create table if not exists public.money_routine_runs (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  step_id uuid not null references public.money_routine_steps(id),
  status text not null default 'open' check (status in ('open','done','skipped')),
  done_by text, done_at timestamptz,
  evidence text,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, step_id)
);
alter table public.money_routine_steps enable row level security;
alter table public.money_routine_runs enable row level security;
create policy "members read routine steps" on public.money_routine_steps for select to authenticated using (public.is_member());
create policy "owners add routine steps" on public.money_routine_steps for insert to authenticated with check (public.is_owner());
create policy "owners change routine steps" on public.money_routine_steps for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read routine runs" on public.money_routine_runs for select to authenticated using (public.is_member());
create policy "members add routine runs" on public.money_routine_runs for insert to authenticated with check (public.is_member());
create policy "members change routine runs" on public.money_routine_runs for update to authenticated using (public.is_member()) with check (public.is_member());
revoke all on public.money_routine_steps, public.money_routine_runs from anon, authenticated;
grant select, insert, update on public.money_routine_steps to authenticated;
grant select, insert, update on public.money_routine_runs to authenticated;

insert into public.money_routine_steps (key, label, detail, anchor_day, owner, href, evidence_rule, sort) values
 ('tiller:fill', 'Check Tiller filled the sheet', 'Newest transaction in the Tiller sheet is within 7 days; if not, run the Fill or re-link the institution, then run the Tiller sync.', 5, 'Ryan', '/money', 'transactions.date max within 7 days of today', 10),
 ('amazon:history', 'Upload the Amazon order-history file', 'Request it from Amazon, then drop the file in the Inbox so every order below the invoice threshold gets its items.', 10, 'Ryan', '/inbox', 'an order-history file was read this period (step 4 of the invoice plan)', 20),
 ('amazon:invoices', 'Drop the Amazon invoices the app asks for', 'The "Amazon invoices wanted" card lists them; drop the PDFs there.', 10, 'either', '/inbox', 'no Amazon order at or above the threshold is without a document', 30),
 ('inbox:answer', 'Answer every open Inbox question', 'Nothing in the Inbox older than 7 days.', 15, 'either', '/inbox', 'no inbox_items open older than 7 days', 40),
 ('charges:unmatched', 'Clear charges with no receipt', 'For each "No receipt found" charge: upload the receipt, explain it, or mark it personal or a transfer.', 20, 'either', '/money/receipts', 'no transactions flagged "[match] No receipt found" older than 30 days', 50),
 ('transfers:confirm', 'Confirm transfers between own accounts', 'Charges that look like transfers or card payments are confirmed so they never count as spending.', 20, 'Ryan', '/money/receipts', 'no transactions with status unknown that look like transfers', 60),
 ('recurring:candidates', 'Review new subscription candidates', 'Yes or No on each "Is this a subscription?" candidate.', 25, 'either', '/money/subscriptions', 'no open subscription_candidates', 70),
 ('shared:acknowledge', 'Acknowledge shared-money changes', 'Both parents acknowledge changes to subscriptions or accounts (two-party rule).', 28, 'either', '/money/recurring', 'no pending acknowledgements', 80)
on conflict (key) do nothing;
insert into public.money_routine_steps (key, label, detail, cadence, anchor_day, account_id, owner, href, evidence_rule, sort)
select 'statement:' || a.id, 'Statement: ' || a.institution || ' ····' || a.last4, 'Download this month''s statement PDF and drop it in the Inbox; the close ties every line to a receipt or an explanation.', 'per_statement', coalesce(a.statement_close_day, 28), a.id, 'Ryan', '/money/receipts', 'a statement document for this account and period is in the Inbox or Receipts', 90
from public.accounts a where a.retired_at is null
on conflict (key) do nothing;
insert into public.money_routine_steps (key, label, detail, cadence, anchor_day, owner, href, evidence_rule, sort) values
 ('statement:wells-fargo-6918', 'Statement: Wells Fargo Cash Back Visa ····6918', 'Tiller does not carry this card: download the statement PDF and drop it in the Inbox so its charges are loaded from the statement.', 'per_statement', 28, 'Ryan', '/money/receipts', 'a statement document for this card and period is in the Inbox or Receipts', 95)
on conflict (key) do nothing;
