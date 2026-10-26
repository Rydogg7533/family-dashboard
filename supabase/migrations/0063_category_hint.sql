-- 0063_category_hint.sql
-- Tiller carries a "Category Hint" column on every transaction: the bank aggregator's (Yodlee's)
-- merchant-level guess, e.g. "Restaurants". The sync never imported it. It is a HINT, never a
-- category: the dashboard owns categories (see decisions log 2026-10-26, Tiller question), and
-- nothing here writes to transactions.category. The hint is shown as a visible guess where a row is
-- uncategorised, and is the starting point for merchant-to-category rules before any receipt is read.
alter table public.transactions add column if not exists category_hint text;
comment on column public.transactions.category_hint is
  'Aggregator''s merchant-level guess from Tiller (Yodlee). A hint only; never copied into category.';
