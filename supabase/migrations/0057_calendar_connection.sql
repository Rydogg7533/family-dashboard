-- person_connections may now also record which person owns the household calendar token (kind 'calendar'), as the table's own comment planned.
-- Additive: the existing 'contacts' rows and policies are untouched. The live calendar reader (src/lib/google-calendar.ts) still uses the GOOGLE_CAL_* token in Vercel;
-- this row says whose events those are, so place and day suggestions never use one person's calendar for another person's stops.
alter table public.person_connections drop constraint person_connections_kind_check;
alter table public.person_connections add constraint person_connections_kind_check check (kind in ('contacts', 'calendar'));
