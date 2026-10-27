-- 0070_kid_receipts.sql
-- Kids keep their receipts (D117). A child whose "receipts" feature is on can photograph a receipt from
-- their own page; the reader reads it like any other; when it cannot tell what was bought, the child gets a
-- task to say what it was. Parents see the result; the child sees only their own. Nothing else opens up:
-- a child still cannot read the Inbox, the ledger, accounts or anyone else's rows.
insert into public.child_features (key, label, description, tier, default_min_age, sensitive, built, sort) values
 ('receipts', 'Keep my receipts', 'Photograph receipts for what they buy; say what it was when the reader cannot tell. Parents see the list.', 2, 10, false, true, 125)
on conflict (key) do update set label = excluded.label, description = excluded.description, built = true;

-- Their own Inbox rows only.
create policy "child adds own receipts" on public.inbox_items for insert to authenticated
  with check (public.is_child() and public.child_can('receipts') and created_by = auth.uid());
create policy "child reads own receipts" on public.inbox_items for select to authenticated
  using (public.is_child() and public.child_can('receipts') and created_by = auth.uid());
create policy "child answers own receipts" on public.inbox_items for update to authenticated
  using (public.is_child() and public.child_can('receipts') and created_by = auth.uid())
  with check (public.is_child() and public.child_can('receipts') and created_by = auth.uid());

-- Their own files only: the capture path starts with their profile id.
create policy "child adds own captures" on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and public.is_child() and public.child_can('receipts') and name like auth.uid()::text || '/%');
create policy "child reads own captures" on storage.objects for select to authenticated
  using (bucket_id = 'captures' and public.is_child() and public.child_can('receipts') and name like auth.uid()::text || '/%');

-- Their own tasks: the "what did you buy" question, and finishing it. A child cannot make any other task.
create policy "child reads own tasks" on public.tasks for select to authenticated
  using (public.is_child() and person = auth.uid());
create policy "child adds own receipt task" on public.tasks for insert to authenticated
  with check (public.is_child() and public.child_can('receipts') and person = auth.uid() and origin_kind = 'kid_receipt');
create policy "child finishes own task" on public.tasks for update to authenticated
  using (public.is_child() and person = auth.uid())
  with check (public.is_child() and person = auth.uid() and status in ('open', 'done'));
