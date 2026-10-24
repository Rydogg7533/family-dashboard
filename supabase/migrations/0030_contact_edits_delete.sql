-- Contact delete (Google only). The app queues a delete edit for the person's own Google contact; the Mac mini backs the contact up,
-- deletes it in Google, and marks the card deleted_at. Nothing is ever erased from this database. Apple contacts cannot be deleted from the app.
alter table public.contact_edits drop constraint if exists contact_edits_op_check;
alter table public.contact_edits add constraint contact_edits_op_check check (op in ('create','update','delete'));
alter table public.contact_edits drop constraint if exists contact_edits_check;
alter table public.contact_edits add constraint contact_edits_check check ((op = 'create' and card_id is null) or (op in ('update','delete') and card_id is not null));
alter table public.contact_edits drop constraint if exists contact_edits_delete_google_only;
alter table public.contact_edits add constraint contact_edits_delete_google_only check (op <> 'delete' or provider = 'google');
