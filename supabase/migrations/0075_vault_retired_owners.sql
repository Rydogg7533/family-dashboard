-- 0075_vault_retired_owners.sql
-- A family member can be retired from Settings > 1Password (they left the household or the system). Their
-- section is hidden from the main list and moves to a collapsed "Retired" area; their pointers are kept,
-- never deleted, and Restore brings the section back. owner_key is "a:<profile id>" or "k:<child id>".
-- This touches nothing else: logins and the rest of the app are unchanged.
create table if not exists public.vault_retired_owners (
  owner_key text primary key,
  retired_at timestamptz,            -- null = restored
  retired_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.vault_retired_owners enable row level security;
create policy "members read retired owners" on public.vault_retired_owners for select to authenticated
  using (public.is_member());
create policy "owners retire" on public.vault_retired_owners for insert to authenticated
  with check (public.is_owner());
create policy "owners restore" on public.vault_retired_owners for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
