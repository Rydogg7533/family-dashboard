-- Voice on the Ask box (D14, 2026-10-28). One row per voice session, for the usage line next to API spend.
-- Seconds and model only; never audio, never a transcript (the exchange itself is in ask_history like typing).
create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor text,
  model text not null,
  seconds integer not null default 0,
  started_at timestamptz not null default now(),
  source text
);
create index if not exists voice_sessions_user_started on public.voice_sessions (user_id, started_at desc);
alter table public.voice_sessions enable row level security;
drop policy if exists voice_sessions_own_read on public.voice_sessions;
create policy voice_sessions_own_read on public.voice_sessions for select to authenticated
  using (public.is_member() and (user_id = auth.uid() or public.is_owner()));
drop policy if exists voice_sessions_own_write on public.voice_sessions;
create policy voice_sessions_own_write on public.voice_sessions for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
