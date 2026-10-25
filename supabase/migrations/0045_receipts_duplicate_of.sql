-- A receipt that turns out to be the same purchase as an earlier one is retired, never deleted:
-- duplicate_of points at the row that is kept. Additive; existing rows are unchanged.
alter table public.receipts add column if not exists duplicate_of uuid references public.receipts(id);
create index if not exists receipts_duplicate_of_idx on public.receipts(duplicate_of) where duplicate_of is not null;
