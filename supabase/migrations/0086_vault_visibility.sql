-- Ryan, 2026-10-28: "Make the other adults' default pointers created by the system visible. If it is generated custom using the
-- create pointer link, don't make them visible unless they are made shared." A pointer is a name and a link; the item itself
-- opens only behind the viewer's own 1Password unlock. So:
--   system-made rows (template_key set): every adult sees them (is_member() = adult), and an owner can create and edit them
--   for another adult, which is how one person sets the house up;
--   hand-made rows (template_key null) with a person: that person only, until they tick Household (person = null).
drop policy if exists "own or household pointers" on public.vault_pointers;
create policy "own or household pointers" on public.vault_pointers for select to authenticated
  using (public.is_member() and (person is null or person = auth.uid() or template_key is not null));
drop policy if exists "members add pointers" on public.vault_pointers;
create policy "members add pointers" on public.vault_pointers for insert to authenticated
  with check (public.is_member() and (person is null or person = auth.uid() or (template_key is not null and public.is_owner())));
drop policy if exists "own or household pointers change" on public.vault_pointers;
create policy "own or household pointers change" on public.vault_pointers for update to authenticated
  using (public.is_member() and (person is null or person = auth.uid() or (template_key is not null and public.is_owner())))
  with check (public.is_member() and (person is null or person = auth.uid() or (template_key is not null and public.is_owner())));
