alter table public.inbox_items add column if not exists claim_id uuid references public.claims(id);
