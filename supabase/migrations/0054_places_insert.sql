-- Places: a person may add a place of their own from the app ("I'm here now" on the Places page).
-- Until now only the Mac mini (service role) could insert. Own rows only; reading, renaming and forgetting are unchanged.
create policy "own inserts places" on public.places
  for insert to authenticated
  with check (person = auth.uid() and is_member());
