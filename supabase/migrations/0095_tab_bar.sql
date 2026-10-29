-- Per-person tab bar (which tabs, in what order; see src/lib/tabs.ts for the catalog). Null = the default set.
-- Members already update their own profile row (0081); the prefs-only trigger keeps role and name with the head.
alter table public.profiles add column if not exists tab_bar text[];
