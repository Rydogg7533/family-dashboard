-- Devices were read-only from the app (the page fell back to sample data when empty).
-- Owners can add and edit devices, matching vehicles. Nothing is ever deleted: retire by status.
create policy "owners add devices" on public.devices for insert to authenticated with check (public.is_owner());
create policy "owners edit devices" on public.devices for update to authenticated using (public.is_owner()) with check (public.is_owner());
