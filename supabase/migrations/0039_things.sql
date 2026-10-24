-- Things: a catalog of everything the household owns, with photos. Clothing is a category, not a separate table.
-- Rules (docs: claude/stewardos-things-catalog-spec-2026-10-24): nothing is ever deleted (status + deleted_at for mistakes), photos live in the
-- private `captures` bucket under <user id>/things/, prices live in a separate owner-only table so only parents with the owner role can read them,
-- and every price carries its source. A manual price is never overwritten by an automatic one.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other',
  owner_kind text not null default 'shared' check (owner_kind in ('person','child','shared')),
  owner_id uuid,                       -- profiles.id when 'person', children.id when 'child'
  location text,
  brand text,
  model text,
  serial_last4 text,
  serial_pointer text,
  size text,
  season text check (season in ('all','summer','winter','spring_fall')),
  notes text,
  status text not null default 'active' check (status in ('active','sold','given_away','lost','discarded')),
  status_at date,
  status_note text,
  linked_kind text check (linked_kind in ('vehicle','device','warranty')),
  linked_id text,
  added_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists items_category_idx on public.items(category) where deleted_at is null;
create index if not exists items_owner_idx on public.items(owner_kind, owner_id) where deleted_at is null;

create table if not exists public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id),
  path text not null,
  thumb_path text,
  name text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists item_photos_item_idx on public.item_photos(item_id) where removed_at is null;

create table if not exists public.item_prices (
  item_id uuid primary key references public.items(id),
  price_cents int check (price_cents is null or price_cents >= 0),
  price_source text check (price_source in ('receipt','manual','estimated','suggested')),
  purchase_date date,
  store text,
  receipt_id uuid references public.receipts(id),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.item_prices enable row level security;

create policy "members read items" on public.items for select to authenticated using (public.is_member());
create policy "members add items" on public.items for insert to authenticated with check (public.is_member());
create policy "members change items" on public.items for update to authenticated using (public.is_member()) with check (public.is_member());

create policy "members read item photos" on public.item_photos for select to authenticated using (public.is_member());
create policy "members add item photos" on public.item_photos for insert to authenticated with check (public.is_member());
create policy "members change item photos" on public.item_photos for update to authenticated using (public.is_member()) with check (public.is_member());

create policy "owners read item prices" on public.item_prices for select to authenticated using (public.is_owner());
create policy "owners add item prices" on public.item_prices for insert to authenticated with check (public.is_owner());
create policy "owners change item prices" on public.item_prices for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- No delete policy on any of the three: nothing is deleted.
