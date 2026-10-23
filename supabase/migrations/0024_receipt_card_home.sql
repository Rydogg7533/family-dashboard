-- D69: one file per receipt, filed under the card it was charged to and the month.
-- card: "Amex 1004" (typed once, offered as a chip after); home_path: where the single file lives on the mini.
alter table public.receipts add column if not exists card text, add column if not exists home_path text;
