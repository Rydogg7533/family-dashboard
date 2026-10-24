-- device_tokens holds credentials (Overland and TV tokens). Row-level security is on with no policies, so no one could read it through the API, but
-- Supabase's default grants still gave anon and signed-in users column access. Remove them: only the service role (the server routes and the
-- Mac mini) touches this table.
revoke all on public.device_tokens from anon, authenticated;
