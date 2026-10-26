-- The time zone was asked for at setup and stored here, but nothing could change it afterwards
-- and nothing read it (the app ran on an env var). Owners can now edit the household row.
create policy "owners edit household" on public.household for update to authenticated using (public.is_owner()) with check (public.is_owner());
-- RLS alone is not enough: the table grant has to allow the write too. Scoped to these two columns,
-- so the child-login settings stay service-role only.
grant update (name, tz) on public.household to authenticated;
