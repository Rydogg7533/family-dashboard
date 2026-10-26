-- 0065_household_mailboxes.sql
-- Which mailboxes the household has already connected, so nobody adds one twice.
-- mail_accounts is own-rows-only (person = auth.uid()), which is right for mail: counts, sync state and
-- errors are the owner's business. But it also means the "Add a mailbox" screen cannot tell you that your
-- spouse already connected the address you are about to type, and setting it up twice under the wrong owner
-- is a real mistake to make (mail-sync refuses it, but only after a confusing detour).
--
-- This view exposes the minimum that prevents that, and nothing more: the address, the kind, whose it is by
-- first name, and whether it is yours. No counts, no last_sync_at, no last_error for anyone else's mailbox.
-- An address is already on every message either spouse sends; a sync error is not.
-- It runs as its owner so it can see past the row policy, and is fenced with is_member() so a child login
-- gets nothing.
create view public.household_mailboxes with (security_invoker = off) as
  select a.address,
         a.kind,
         p.display_name as owner,
         (a.person = auth.uid()) as mine
  from public.mail_accounts a
  left join public.profiles p on p.id = a.person
  where public.is_member();

comment on view public.household_mailboxes is
  'Addresses and owners of every connected mailbox, for the Add a mailbox screen. Deliberately omits counts, sync times and errors for mailboxes that are not yours.';

revoke all on public.household_mailboxes from anon;
grant select on public.household_mailboxes to authenticated;
