-- Filing a statement is an upsert on inbox_id (a second tap must not create a second row). An upsert needs UPDATE,
-- which 0105 never granted, so every filing failed with "permission denied". Members only; still no delete.
grant update on public.account_statements to authenticated;
create policy "members update statements" on public.account_statements for update to authenticated
  using ((select is_member())) with check ((select is_member()));
