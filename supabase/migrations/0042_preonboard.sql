-- Pre-onboarding checklist: a link Ryan sends a prospective buyer before they start the real setup wizard.
-- The buyer has no account and no session, so the public page proves itself with a token (hashed here,
-- same pattern as child_invites and device_tokens: only the hash is stored, never the raw link).
-- Members (parents) manage links and read progress through normal RLS; the public page reads/writes
-- through the service role after matching the hash itself, like the kitchen tablet and /join flows.

create table public.preonboard_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default '',              -- Ryan's own note, e.g. "The Hendersons" - never shown to the buyer
  created_by text,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz,
  answers jsonb not null default '{}'::jsonb,   -- { [itemKey]: { checked: bool, value?: string, updatedAt: iso } }
  completed_at timestamptz,
  revoked_at timestamptz
);

alter table public.preonboard_links enable row level security;

create policy "members read preonboard links" on public.preonboard_links
  for select using (public.is_member());
create policy "members create preonboard links" on public.preonboard_links
  for insert with check (public.is_member());
create policy "members update preonboard links" on public.preonboard_links
  for update using (public.is_member()) with check (public.is_member());
-- No delete policy anywhere: a link is revoked (revoked_at set), never removed.

create index preonboard_links_created_idx on public.preonboard_links (created_at desc);
