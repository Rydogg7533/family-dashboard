-- The buyer's own email, captured on the pre-onboarding checklist, and when the onboarding email was
-- last sent to it. Dedicated columns (not the jsonb answers blob) because the send flow reads and writes
-- this directly, and "resend" needs a reliable, single value rather than free text from the household-basics
-- item (which stays as-is: two names and two emails typed together, fine for a human to read, not for code).
alter table public.preonboard_links
  add column onboarding_email text,
  add column onboarding_sent_at timestamptz;
