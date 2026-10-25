-- Applied live as "0043_ai_outcomes" (the repo already had a 0043 file from another session; applied by name, as before).
-- Model reliability data: extend ai_usage (shape only) and add an append-only outcomes table.
alter table public.ai_usage
  add column if not exists latency_ms integer,
  add column if not exists runtime text not null default 'cloud',
  add column if not exists prompt_version text,
  add column if not exists valid_output boolean,
  add column if not exists subject_kind text,
  add column if not exists subject_id text;

comment on column public.ai_usage.runtime is 'cloud or local; lets the scorecard compare local models with the cloud model on the same job';
comment on column public.ai_usage.valid_output is 'false when the reply could not be parsed (bad JSON, failed tool call)';

create table if not exists public.ai_outcomes (
  id bigint generated always as identity primary key,
  usage_id bigint not null references public.ai_usage(id),
  at timestamptz not null default now(),
  outcome text not null check (outcome in ('accepted','edited','rejected','ignored')),
  fields_changed text[] not null default '{}',
  by_person uuid default auth.uid(),
  note text
);
comment on table public.ai_outcomes is 'Append-only. What a person did with a model result. fields_changed holds field names only, never values. Never updated or deleted.';
create index if not exists ai_outcomes_usage_idx on public.ai_outcomes (usage_id);

alter table public.ai_outcomes enable row level security;

create policy "members read ai outcomes" on public.ai_outcomes
  for select to authenticated using (public.is_member());
create policy "members record ai outcomes" on public.ai_outcomes
  for insert to authenticated with check (public.is_member());

create or replace view public.model_scorecard with (security_invoker = true) as
select
  u.job, u.feature, u.model, u.runtime, u.prompt_version,
  count(*) as runs,
  count(o.outcome) as judged,
  count(*) filter (where o.outcome = 'accepted') as accepted,
  count(*) filter (where o.outcome = 'edited') as edited,
  count(*) filter (where o.outcome = 'rejected') as rejected,
  count(*) filter (where u.valid_output is false) as invalid,
  round(avg(u.latency_ms)) as avg_latency_ms,
  sum(u.cost_usd) as cost_usd
from public.ai_usage u
left join lateral (
  select outcome from public.ai_outcomes where usage_id = u.id order by at desc limit 1
) o on true
where u.sample = false
group by u.job, u.feature, u.model, u.runtime, u.prompt_version;
