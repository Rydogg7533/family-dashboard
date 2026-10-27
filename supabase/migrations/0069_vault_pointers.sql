-- 0069_vault_pointers.sql
-- Sensitive documents live in 1Password. The app keeps a pointer per item: a name, which group it belongs
-- to, and the item's private link (opens only for someone signed in to that 1Password account). Never the
-- contents, never a number. Ask answers "where is my passport" with the name and an Open button.
--
-- person = null means a household item (1Password Shared vault). A person's own pointers are theirs alone.
create table if not exists public.vault_pointers (
  id uuid primary key default gen_random_uuid(),
  person uuid references public.profiles(id) on delete set null,   -- null = household
  "group" text not null check ("group" in ('identity','vehicles','home','health','money','business','estate','devices','other')),
  label text not null,                       -- "Ryan passport"
  item_type text,                            -- 1Password type: passport, driver_license, ssn, document, bank_account, secure_note, membership …
  link text,                                 -- https://start.1password.com/open/i?… (private link) or onepassword://
  expires_on date,                           -- a renewal to remind about (passport, license, registration)
  attached_kind text,                        -- vehicle | medication | account | device | record — when it belongs to a row elsewhere
  attached_id text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists vault_pointers_person_idx on public.vault_pointers (person, "group") where deleted_at is null;
alter table public.vault_pointers enable row level security;
create policy "own or household pointers" on public.vault_pointers for select to authenticated
  using (public.is_member() and (person is null or person = auth.uid()));
create policy "members add pointers" on public.vault_pointers for insert to authenticated
  with check (public.is_member() and (person is null or person = auth.uid()));
create policy "own or household pointers change" on public.vault_pointers for update to authenticated
  using (public.is_member() and (person is null or person = auth.uid()))
  with check (public.is_member() and (person is null or person = auth.uid()));
