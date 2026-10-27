-- Sender check for mailing lists (2026-10-27). Anyone can put a List-Unsubscribe header on a mail, so before the Mac mini talks to an
-- unsubscribe address the scanner records whether Gmail's own sender checks passed (SPF/DKIM/DMARC aligned with the From domain) and
-- whether the unsubscribe address belongs to the sender or a known mailing service. Rows that fail land in a new status 'check':
-- nothing is sent, the app shows why, and the person can say "I know this sender" (trusted_at/trusted_by), which requests it again.
-- Also lets the person put a 'needs_tap' / 'open_link' / 'failed' / 'check' row back to 'active' to try again.

alter table public.email_subscriptions
  add column if not exists auth_ok boolean,                 -- null = not checked yet (checked on the next mail scan)
  add column if not exists auth_note text,                  -- plain-words reason, never contains an address
  add column if not exists trusted_at timestamptz,          -- the person said they know this sender
  add column if not exists trusted_by uuid references auth.users(id);

alter table public.email_subscriptions drop constraint if exists email_subscriptions_status_check;
alter table public.email_subscriptions add constraint email_subscriptions_status_check
  check (status in ('active','requested','done','needs_tap','open_link','failed','stopped','check'));

grant update (status, requested_at, requested_by, updated_at, trusted_at, trusted_by) on table public.email_subscriptions to authenticated;

-- The app may move a row: active <-> requested (tick / cancel), and from any state that is waiting on the person
-- (needs_tap, open_link, failed, check) back to active (try again) or straight to requested (after marking it trusted).
drop policy if exists "own requests email unsubscribe" on public.email_subscriptions;
create policy "own requests email unsubscribe" on public.email_subscriptions
  for update to authenticated
  using (is_member() and person = auth.uid() and status in ('active','requested','needs_tap','open_link','failed','check'))
  with check (is_member() and person = auth.uid() and status in ('active','requested'));

comment on column public.email_subscriptions.auth_ok is 'Scanner verdict: Gmail SPF/DKIM/DMARC aligned with the From domain AND the unsubscribe address belongs to the sender (or a known mailing service). null = not checked yet.';
comment on column public.email_subscriptions.trusted_at is 'The person said they know this sender, overriding auth_ok=false for the unsubscribe agent.';
