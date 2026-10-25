-- Household-wide settings (one row per setting). Per-person settings stay in person_settings.
-- Members read; only owners write (enforced by RLS, not just by the page).
create table if not exists public.household_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.household_settings enable row level security;
drop policy if exists "members read household settings" on public.household_settings;
create policy "members read household settings" on public.household_settings for select to authenticated using (public.is_member());
drop policy if exists "owners insert household settings" on public.household_settings;
create policy "owners insert household settings" on public.household_settings for insert to authenticated with check (public.is_owner());
drop policy if exists "owners update household settings" on public.household_settings;
create policy "owners update household settings" on public.household_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());
revoke all on public.household_settings from anon, authenticated;
grant select, insert, update on public.household_settings to authenticated;
-- Amazon invoices: ask for the invoice PDF for orders at or above ask_min_amount (dollars); for orders below it,
-- below = 'wait_for_history' (one task, waiting for the Amazon order-history file) or 'ignore'.
insert into public.household_settings (key, value, updated_by) values ('amazon_invoices', '{"ask_min_amount": 0, "below": "wait_for_history"}'::jsonb, 'System (default)') on conflict (key) do nothing;
