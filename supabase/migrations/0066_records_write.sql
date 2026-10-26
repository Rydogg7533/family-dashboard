-- 0066_records_write.sql
-- Records could only be read by members; the email funnel wrote them with the service role. Ask (and the
-- Records page after it) lets a person save a confirmation themselves, so members may insert and update.
-- Nothing deletes: a record is archived by status, never removed.
create policy "members add records"    on public.records for insert to authenticated with check (public.is_member());
create policy "members change records" on public.records for update to authenticated using (public.is_member()) with check (public.is_member());
