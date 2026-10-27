-- 0074_ask_history.sql
-- Every Ask exchange, kept (D80 follow-on, 2026-10-27). The Ask box itself carries only the last 24 hours /
-- 12 turns to the model, so answers stay fast and cost the same on day 30 as on day 1; everything older
-- lives here, searchable on the history page and readable by Ask through the ask.history tool.
-- One row per exchange: the question, the answer, what tools ran (names and one-line summaries only,
-- never document contents), cost. A person's own rows only. Never deleted: deleted_at.
create table if not exists public.ask_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor text not null,                       -- email, as every other log names people
  at timestamptz not null default now(),
  source text not null default 'ask',        -- 'ask' (the tab) or 'page:<path>' (the sheet on that page)
  question text not null,
  answer text not null,
  kind text not null,                        -- the reply kind: answer, tool_confirm, event_confirm, …
  tools jsonb,                               -- [{name, ok, summary}] from the loop's trace
  proposed text,                             -- the write Ask proposed, if any: "document.send {…}"
  cost numeric(10,5) not null default 0,
  model text,
  deleted_at timestamptz
);
create index if not exists ask_history_user_at_idx on public.ask_history (user_id, at desc) where deleted_at is null;
alter table public.ask_history enable row level security;
create policy "own ask history" on public.ask_history for select to authenticated
  using (public.is_member() and user_id = auth.uid());
create policy "own ask history add" on public.ask_history for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
-- no update or delete policy: the log is append-only; deleted_at is set by the maintainer only
