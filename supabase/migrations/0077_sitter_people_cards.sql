-- Approved sitters point at the live address book (contact_cards, synced per adult from Google or iCloud), not the empty legacy contacts table.
-- A brand-new sitter is a contact_edits 'create' row until the Mac mini sync writes the card; sitter_people holds pending_edit_id meanwhile and
-- the app links contact_id once the card exists (match by the person who asked plus the phone or name in the edit). No name or phone is copied.
alter table public.sitter_people drop constraint if exists sitter_people_contact_id_fkey;
alter table public.sitter_people drop constraint if exists sitter_people_guardian_contact_id_fkey;
alter table public.sitter_people alter column contact_id drop not null;
alter table public.sitter_people add constraint sitter_people_contact_id_fkey foreign key (contact_id) references public.contact_cards(id);
alter table public.sitter_people add constraint sitter_people_guardian_contact_id_fkey foreign key (guardian_contact_id) references public.contact_cards(id);
alter table public.sitter_people add column if not exists pending_edit_id uuid references public.contact_edits(id);
alter table public.sitter_people add column if not exists finish_task_id uuid references public.tasks(id);
alter table public.sitter_people drop constraint if exists sitter_people_identity_check;
alter table public.sitter_people add constraint sitter_people_identity_check check (contact_id is not null or pending_edit_id is not null);
create unique index if not exists sitter_people_pending_idx on public.sitter_people(pending_edit_id) where pending_edit_id is not null and archived_at is null;

alter table public.sitter_sheet_items drop constraint if exists sitter_sheet_items_contact_id_fkey;
alter table public.sitter_sheet_items add constraint sitter_sheet_items_contact_id_fkey foreign key (contact_id) references public.contact_cards(id);
