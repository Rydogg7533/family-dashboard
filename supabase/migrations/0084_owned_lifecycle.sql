-- D18, things lifecycle (Ryan, 2026-10-28). A thing the household owns (an item, a device, a vehicle) can be new, a replacement,
-- or on its way out; the register keeps every step and never deletes. New here:
--   replaces / replaced_by  link the new thing to the one it took over from (across registers: "device:<id>", "item:<id>", "vehicle:<id>")
--   source, from_whom       how it arrived: bought, gift, hand_me_down, inherited, won (no receipt needed for the last four)
--   status 'undecided'      "not sure yet what happens to the old one" is an answer; the review asks again after 30 days (fate_asked_at)
--   status 'gone'           it left the house but nobody recorded how; the review asks once, for the money side
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check check (status in ('active','sold','given_away','lost','discarded','undecided','gone'));
alter table public.items add column if not exists replaces text, add column if not exists replaced_by text, add column if not exists source text,
  add column if not exists from_whom text, add column if not exists fate_asked_at timestamptz;
alter table public.devices add column if not exists replaces text, add column if not exists replaced_by text, add column if not exists source text,
  add column if not exists from_whom text, add column if not exists fate_asked_at timestamptz;
alter table public.vehicles add column if not exists replaces text, add column if not exists replaced_by text, add column if not exists source text,
  add column if not exists from_whom text, add column if not exists fate_asked_at timestamptz;
