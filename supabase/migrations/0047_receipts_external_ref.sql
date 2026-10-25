-- A stable outside reference for a receipt created from an email (for example "amazon:113-0000000-0000000").
-- Makes re-running the Amazon order reader (scripts/amazon-orders.mjs) idempotent. NULLs stay distinct, so ordinary receipts are unaffected.
alter table public.receipts add column if not exists external_ref text;
create unique index if not exists receipts_external_ref_key on public.receipts(external_ref);
