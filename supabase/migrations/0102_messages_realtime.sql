-- Thread pages subscribe to their own new lines (RLS: owner only), so a line shows the moment the mirror writes it.
alter publication supabase_realtime add table public.messages;
