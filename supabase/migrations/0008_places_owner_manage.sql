-- Places page: Rename / Merge / Forget work for the owner (F8.5). Forget deletes the Place; its stops and blocks keep
-- their times and lose the label. Merge moves stops and blocks to the surviving Place, then deletes the other.
create policy "own deletes places" on public.places for delete using (person = auth.uid());
-- Stops and blocks need to point away from a Place before it goes (no cascade: the day record is never deleted).
alter table public.location_stops drop constraint location_stops_place_id_fkey,
  add constraint location_stops_place_id_fkey foreign key (place_id) references public.places(id) on delete set null;
alter table public.day_blocks add constraint day_blocks_place_id_fkey foreign key (place_id) references public.places(id) on delete set null;
