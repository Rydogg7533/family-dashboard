-- Slice B: email tasks (drafts, rules), Inbox, Money (accounts by last-4 only, transactions, receipts,
-- reconciliations, recurring), Records and proofs (F22), AI usage (F18).
-- Money is recorded, never moved. No account numbers, credentials or document contents anywhere.
-- "Always say who": every row carries requested_by / for_person / captured_by.

-- ---- Inbox: items to identify, file or decide; never cleared by time ----
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('identify','file','decide','ask_thread')),
  title text not null,
  origin text not null,
  origin_href text not null default '#',
  origin_label text not null default 'Files',
  requested_by text not null default 'System',
  for_person text,
  captured_at timestamptz not null default now(),
  missing text not null,                       -- the one question, in plain words
  options jsonb not null default '[]',         -- suggested answers
  thread jsonb,                                -- for ask_thread: [{at, who, text}]
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz
);
create index inbox_items_status_idx on public.inbox_items(status, captured_at);

-- ---- Email: the family's own rules and the in-dashboard drafts ----
create table public.email_rules (
  id uuid primary key default gen_random_uuid(),
  match_kind text not null check (match_kind in ('sender','domain','merchant','answer')),
  match_value text not null,
  action text not null check (action in ('archive','file','money','task','ignore','record','classify','unsubscribe')),
  target text,
  origin text not null,                        -- where the rule came from ("Ryan: ignore this sender", "Inbox answer i3")
  proposed_by uuid references public.profiles(id),
  status text not null default 'proposed' check (status in ('proposed','approved','off')),
  created_at timestamptz not null default now()
);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  requested_by text not null default 'Ryan',
  account text not null,                       -- mailbox name only
  "to" text not null,                          -- display name only
  subject text not null,
  text text not null default '',
  attachments jsonb not null default '[]',     -- [{name, status: attached|missing, path, looked_in[]}]
  complete boolean not null default false,     -- every attachment attached, or create_anyway
  create_anyway boolean not null default false,
  mail_requested_at timestamptz,               -- set by the browser; the mini agent creates the mail draft
  mail_draft_ref text,                         -- id in the mail app once created; never a send
  origin_href text not null default '#',
  updated_at timestamptz not null default now()
);
create unique index drafts_task_idx on public.drafts(task_id);

-- ---- Money ----
create table public.accounts (
  id text primary key,                         -- slug like amex-1004
  kind text not null check (kind in ('credit','checking','savings','payment_app','business')),
  institution text not null,
  last4 text not null check (char_length(last4) <= 4),
  owner text not null,                         -- Ryan, Melissa, Joint
  entity text not null default 'Personal',
  statement_close_day int, due_day int,
  autopay boolean not null default false,
  balance_current numeric, balance_statement numeric,
  last_reconciled date,
  unreconciled int not null default 0,
  vault_item text,                             -- name of the login item in the vault, never the login
  synced_at timestamptz not null default now(),
  source text not null default 'Tiller sheet'
);

create table public.transactions (
  id text primary key,                         -- Tiller transaction id
  account_id text not null references public.accounts(id),
  amount numeric not null,
  merchant text not null,
  date date not null,
  category text,
  entity text not null default 'Personal',
  status text not null default 'unknown' check (status in ('matched','classified','unknown','personal','transfer','refund_pending','disputed','reimbursable')),
  matched_receipt uuid,
  note text,
  searched jsonb not null default '[]',
  flag text,
  for_person text not null default 'Ryan',     -- whose purchase (card owner by default)
  captured_by text not null default 'System (Tiller)',
  reconciliation_id text,
  updated_at timestamptz not null default now()
);
create index transactions_account_date_idx on public.transactions(account_id, date desc);
create index transactions_status_idx on public.transactions(status);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  merchant text not null,
  amount numeric not null,
  date date not null,
  source text not null check (source in ('email','camera','upload','bulk','organized')),
  file_path text,                              -- path under Organized, never contents
  thumbnail text,                              -- small data url or storage path
  transaction_id text references public.transactions(id),
  status text not null default 'unmatched' check (status in ('matched','expecting_charge','unmatched','needs_info')),
  question text,
  entity text,
  captured_by text not null default 'System',
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.transactions add constraint transactions_receipt_fk foreign key (matched_receipt) references public.receipts(id);

create table public.reconciliations (
  id text primary key,                         -- rec-<account>-<yyyy-mm>
  account_id text not null references public.accounts(id),
  period text not null,
  kind text not null check (kind in ('card','debit')),
  for_person text not null default 'Ryan',
  status text not null default 'open' check (status in ('open','done','exceptions')),
  total_lines int not null default 0, tied_lines int not null default 0, to_explain int not null default 0,
  statement_total numeric not null default 0,
  due_at date,
  summary text,
  statement_file text,
  tie_out jsonb,                               -- {opening, deposits, withdrawals, closing, ok}
  exceptions_reason text,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz
);

create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('subscription','bill','loan','insurance')),
  amount numeric not null,
  cycle text not null check (cycle in ('monthly','yearly','weekly')),
  next_charge date not null,
  account_id text references public.accounts(id),
  entity text not null default 'Personal',
  both_names boolean not null default false,
  cancel_at text,                              -- where to cancel, in words
  decision text not null default 'keep' check (decision in ('keep','cancel','downgrade','review')),
  decided_by text not null default 'System (register)',
  last_negotiated text,
  on_register boolean not null default true,
  ack_waiting text,                            -- name of the parent whose acknowledgement is pending
  updated_at timestamptz not null default now()
);

-- ---- F22: records (confirmations kept until needed-until) and proofs (no money event without proof) ----
create type public.record_kind as enum ('reservation','ticket','government','insurance_claim','warranty_return','appointment','service_contract','support_case','membership_license','receipt');

create table public.records (
  id uuid primary key default gen_random_uuid(),
  kind public.record_kind not null,
  title text not null,
  for_person text,
  requested_by text not null default 'System (email funnel)',
  confirmation_number text,
  happens_at date,
  needed_until date,
  retention_rule text not null,
  file_ref text,                               -- path under ~/Organized/Personal/Documents/Records/<year>/<kind>/, reference only
  source_name text not null default 'Gmail',
  source_href text not null default '#',
  tax_year int,
  status text not null default 'active' check (status in ('active','needed_soon','archived')),
  transaction_id text references public.transactions(id),
  created_at timestamptz not null default now()
);
create index records_status_needed_idx on public.records(status, needed_until);

create table public.proofs (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null references public.transactions(id) on delete cascade,
  kind text not null check (kind in ('digital_receipt','photo','statement_line')),
  source_href text not null default '#',
  captured_at timestamptz not null default now(),
  captured_by uuid references public.profiles(id)
);
create index proofs_tx_idx on public.proofs(transaction_id);

-- A reconciliation cannot be marked done while any of its transactions has no proof at all (red).
create or replace function public.reconciliation_has_red() returns trigger
language plpgsql as $$
begin
  if new.status in ('done','exceptions') and exists (
    select 1 from public.transactions t
    where t.account_id = new.account_id and (t.reconciliation_id = new.id or t.reconciliation_id is null)
      and t.status <> 'transfer'
      and not exists (select 1 from public.proofs p where p.transaction_id = t.id)
  ) then
    raise exception 'Reconciliation % has transactions with no proof; attach a receipt, photo or statement line first', new.id;
  end if;
  return new;
end $$;
create trigger reconciliations_no_red before update on public.reconciliations
  for each row execute function public.reconciliation_has_red();

-- ---- F18: every model call, with cost (shown, never enforced) ----
create table public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  model text not null,
  job text not null,
  feature text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric not null default 0,
  sample boolean not null default false,
  reason text,                                 -- required for opus
  person uuid references public.profiles(id)
);
create index ai_usage_at_idx on public.ai_usage(at desc);

-- ---- RLS: members read everything; browser writes only where the requirements allow ----
alter table public.inbox_items enable row level security;
alter table public.email_rules enable row level security;
alter table public.drafts enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.receipts enable row level security;
alter table public.reconciliations enable row level security;
alter table public.recurring_items enable row level security;
alter table public.records enable row level security;
alter table public.proofs enable row level security;
alter table public.ai_usage enable row level security;

create policy "members read inbox"      on public.inbox_items     for select using (public.is_member());
create policy "members read rules"      on public.email_rules     for select using (public.is_member());
create policy "members read drafts"     on public.drafts          for select using (public.is_member());
create policy "members read accounts"   on public.accounts        for select using (public.is_member());
create policy "members read tx"         on public.transactions    for select using (public.is_member());
create policy "members read receipts"   on public.receipts        for select using (public.is_member());
create policy "members read recs"       on public.reconciliations for select using (public.is_member());
create policy "members read recurring"  on public.recurring_items for select using (public.is_member());
create policy "members read records"    on public.records         for select using (public.is_member());
create policy "members read proofs"     on public.proofs          for select using (public.is_member());
create policy "members read ai usage"   on public.ai_usage        for select using (public.is_member());

-- Browser writes allowed by the requirements:
-- inbox: resolve an item (and create one from a capture or a parked Ask thread)
create policy "members resolve inbox"   on public.inbox_items for update using (public.is_member()) with check (status in ('open','resolved'));
create policy "members add inbox"       on public.inbox_items for insert with check (public.is_member());
-- drafts: edit text, attachments, complete, create_anyway, request the mail draft (never send)
create policy "members edit drafts"     on public.drafts for update using (public.is_member()) with check (true);
-- receipts: upload metadata for a capture
create policy "members add receipts"    on public.receipts for insert with check (public.is_member() and uploaded_by = auth.uid());
create policy "members answer receipts" on public.receipts for update using (public.is_member()) with check (true);
-- proofs: a photo or upload attached to a charge
create policy "members add proofs"      on public.proofs for insert with check (public.is_member());
-- rule answers: proposed only; approval and action happen through the service role
create policy "members propose rules"   on public.email_rules for insert with check (public.is_member() and status = 'proposed');
-- explain a charge (status, note, flag only; Tiller columns are never changed by the browser)
create policy "members explain tx"      on public.transactions for update using (public.is_member()) with check (true);
-- ai usage: server actions record calls made on the person's behalf
create policy "members record ai usage" on public.ai_usage for insert with check (public.is_member());
-- Everything else (accounts, reconciliations, recurring, records) is written by the Mac mini agent (service role).
