-- Mail over IMAP for any provider (D75): mail_accounts.kind gains 'other'.
alter table public.mail_accounts drop constraint if exists mail_accounts_kind_check;
alter table public.mail_accounts add constraint mail_accounts_kind_check check (kind in ('gmail','icloud','other'));
