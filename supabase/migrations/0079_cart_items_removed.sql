-- Shop list items added through Ask live in cart_items; the page merges them with its per-device cart. Removing one marks it, never deletes.
alter table public.cart_items add column if not exists removed_at timestamptz;
alter table public.cart_items add column if not exists added_by_name text;
