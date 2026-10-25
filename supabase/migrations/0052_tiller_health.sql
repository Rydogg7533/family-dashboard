-- Tiller health gate (2026-10-25). Applied live with apply_migration "tiller_health".
-- 1) accounts.tiller_tracked: false for a card Tiller does not carry (its statement fills it in), so the health check skips it.
--    Inference (Ryan can overrule): Wells Fargo Cash Back Visa ····6918, per the routine seed ("Tiller does not carry this card").
-- 2) account_period_confirms: a person says "this account had no activity this month". Never deleted: undoing sets revoked_at.
alter table public.accounts add column if not exists tiller_tracked boolean not null default true;
update public.accounts set tiller_tracked = false where id = 'wells-fargo-cash-back-visa-signature-car-6918';

create table if not exists public.account_period_confirms (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  account_id text not null references public.accounts(id),
  confirmed_by text not null,
  confirmed_at timestamptz not null default now(),
  note text,
  revoked_at timestamptz,
  revoked_by text,
  unique (period, account_id)
);
alter table public.account_period_confirms enable row level security;
create policy "members read confirms" on public.account_period_confirms for select to authenticated using (public.is_member());
create policy "members add confirms" on public.account_period_confirms for insert to authenticated with check (public.is_member());
create policy "members change confirms" on public.account_period_confirms for update to authenticated using (public.is_member()) with check (public.is_member());
revoke all on public.account_period_confirms from anon, authenticated;
grant select, insert, update on public.account_period_confirms to authenticated;

update public.money_routine_steps set
  label = 'Check every Tiller account delivered its charges',
  detail = 'Each Tiller account must have charges through the end of the month with no long silences. A failing account needs its bank re-linked in Tiller, or your confirmation that it had no activity. Nothing that relies on complete charges can finish until this passes.',
  evidence_rule = 'every Tiller-fed account passes the per-account health check (fresh sync, no gap beyond 3x its usual silence)'
where key = 'tiller:fill';
