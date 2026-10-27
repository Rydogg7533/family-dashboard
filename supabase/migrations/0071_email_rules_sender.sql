-- Sender rules become real (decisions log 2026-10-27, D121). Until now nothing read email_rules;
-- a "never from this sender" tap wrote a row no script enforced. This adds what a reader needs
-- (which mailbox, how often it bit) and lets owners activate a proposed rule. Nothing acts on a
-- rule until status = 'approved'; the scripts only ever read approved rows.
alter table public.email_rules
  add column if not exists mailbox text,                       -- null = every mailbox; else one address
  add column if not exists note text,                          -- shown on the review card: why it was proposed
  add column if not exists hit_count integer not null default 0,
  add column if not exists last_hit_at timestamptz,
  add column if not exists activated_by uuid references public.profiles(id),
  add column if not exists activated_at timestamptz;

-- One live rule per (kind, value, action, mailbox). Rows switched off are kept as history.
create unique index if not exists email_rules_live_uniq
  on public.email_rules (match_kind, match_value, action, coalesce(mailbox, ''))
  where status in ('proposed', 'approved');

-- Owners activate or switch off; members may still only propose. Activation is the tap that
-- makes a rule act, so it is the owner tier (F15 fix 2, high).
drop policy if exists "owners set rule status" on public.email_rules;
create policy "owners set rule status" on public.email_rules
  for update using (is_owner()) with check (is_owner());
