-- Work area: share links for customer-facing files (one household setting, keyed by file name).
-- Seed the StewardOS overview's link so the card works on day one; the owner can change it in the app.
insert into public.household_settings (key, value, updated_by)
values ('customer_materials', '{"share_links": {"stewardos-overview-for-customers.md": "https://claude.ai/artifact/44aD2Jm9e7z4EhRUh3nStK"}}'::jsonb, 'System (migration 0072)')
on conflict (key) do nothing;
