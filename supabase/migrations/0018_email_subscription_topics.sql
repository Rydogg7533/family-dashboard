-- What each mailing list is about, worked out on the Mac mini from the sender and the subject lines of its recent mail
-- (scripts/subscriptions-lib.mjs: categorize). Subjects are kept for the 3 newest messages only, and never for 'account' senders
-- (bank, receipts, security, health, school), where the label alone is stored.
alter table public.email_subscriptions
  add column category text check (category in ('promos','news','social','donations','travel','orders','unclear','account')),
  add column recent_subjects text[] not null default '{}';
comment on column public.email_subscriptions.category is 'Likely purpose of the list, from keyword rules on sender + recent subjects. account = notices the person probably wants.';
comment on column public.email_subscriptions.recent_subjects is 'Up to 3 newest subject lines (trimmed to 120 chars). Empty for category account.';
