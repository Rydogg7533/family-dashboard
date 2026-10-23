-- Inbox hand-over: who it is handed to, who uploaded it, who handed it over.
alter table public.inbox_items
  add column if not exists assigned_to uuid references public.profiles(id),
  add column if not exists created_by uuid references public.profiles(id) default auth.uid(),
  add column if not exists assigned_by uuid references public.profiles(id);
update public.inbox_items set created_by = '158bb4d5-75ab-42be-92bc-7abb728839b8' where created_by is null and requested_by = 'admin@shvr.co';
