-- A child login reads its own `children` row (birth year, parent overrides, paused flag), so the kid page can show exactly what is on.
-- It still cannot read any other child's row, and members' read policy is unchanged.
drop policy if exists "child reads own children row" on public.children;
create policy "child reads own children row" on public.children for select to authenticated using (profile_id = auth.uid());
