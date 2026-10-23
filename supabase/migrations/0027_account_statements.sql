-- D71: every card and bank account owes a statement every month. Each account records when its statement usually arrives
-- and how (PDF attached to the email, a link only, or an upload by hand). Accounts are never deleted; retired_at ends the duty.
alter table public.accounts
  add column if not exists statement_arrival_day int check (statement_arrival_day between 1 and 31),
  add column if not exists statement_delivery text not null default 'email_pdf' check (statement_delivery in ('email_pdf','email_link','upload')),
  add column if not exists retired_at timestamptz;
create policy "owners add accounts" on public.accounts for insert to authenticated with check (public.is_owner());
create policy "owners edit accounts" on public.accounts for update to authenticated using (public.is_owner()) with check (public.is_owner());
