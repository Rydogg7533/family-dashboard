-- 0067_fetch_requests.sql
-- Retrieval is pull, never push (D104). When Ask finds a file the cloud does not hold, a member asks for it
-- here; the hub's fetcher (service role) polls, uploads a copy to the private "deliveries" bucket, and marks
-- the row delivered. The app then serves a short-lived signed link. No inbound port on the hub, nothing to
-- configure. Delivered copies are kept (D105: cloud copies are not deleted by default); the signed link is
-- what expires.
create table if not exists public.fetch_requests (
  id uuid primary key default gen_random_uuid(),
  path text not null,                                   -- under the hub's Organized tree, e.g. Organized/Personal/Documents/.../x.pdf
  register text,                                        -- receipt | record | catalog ...
  ref text,                                             -- the row the path came from (id only)
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  picked_at timestamptz,                                -- the fetcher saw it
  delivered_at timestamptz,
  storage_path text,                                    -- deliveries/<id>/<basename>
  error text,
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists fetch_requests_open_idx on public.fetch_requests (requested_at) where delivered_at is null and error is null;
alter table public.fetch_requests enable row level security;
create policy "members read fetches" on public.fetch_requests for select to authenticated using (public.is_member());
create policy "members ask for fetches" on public.fetch_requests for insert to authenticated with check (public.is_member() and requested_by = auth.uid());

insert into storage.buckets (id, name, public) values ('deliveries', 'deliveries', false) on conflict (id) do nothing;
create policy "members read deliveries" on storage.objects for select to authenticated using (bucket_id = 'deliveries' and public.is_member());
