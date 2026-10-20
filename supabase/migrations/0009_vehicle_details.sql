-- Everything about a vehicle that might matter in a repair, claim, sale or emergency.
-- Fixed keys, written by the vehicle form: see src/lib/vehicle-fields.ts. Never a VIN, never a policy or loan number: pointers only.
alter table public.vehicles add column if not exists details jsonb not null default '{}';

-- Parents (owners) can add and edit vehicles; the driver policy from 0002 still lets a driver update their own.
create policy "owners add vehicles" on public.vehicles for insert to authenticated with check (public.is_owner());
create policy "owners edit vehicles" on public.vehicles for update to authenticated using (public.is_owner()) with check (public.is_owner());
