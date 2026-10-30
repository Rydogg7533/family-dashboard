-- 0104: RLS policies evaluate auth functions once per query, not once per row.
--
-- Every policy called is_member() / is_owner() / auth.uid() bare. A SECURITY DEFINER function with SET search_path
-- cannot be inlined, so Postgres ran the subquery on profiles for every candidate row: Transactions (1,808 rows)
-- cost 25.6 ms per read as the owner, Contacts 156 ms on average in pg_stat_statements. Wrapping the call in
-- (select ...) turns it into an InitPlan evaluated once: the same Transactions read measured 0.76 ms (2026-10-30).
-- Same predicate, same answer, same security — only when it is evaluated changes.
--
-- Constraint from here on: every policy wraps auth functions in (select ...). This block is idempotent: a call
-- already preceded by "select " is left alone, so re-running it is harmless.
do $$
declare
  p record;
  q text;
  w text;
  sql text;
  n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    q := p.qual;
    w := p.with_check;
    if q is not null then
      q := regexp_replace(q, '(?<!select )\m(is_member|is_owner)\(\)', '(select \1())', 'gi');
      q := regexp_replace(q, '(?<!select )\mauth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi');
    end if;
    if w is not null then
      w := regexp_replace(w, '(?<!select )\m(is_member|is_owner)\(\)', '(select \1())', 'gi');
      w := regexp_replace(w, '(?<!select )\mauth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi');
    end if;
    if q is distinct from p.qual or w is distinct from p.with_check then
      sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
      if q is not null then sql := sql || format(' using (%s)', q); end if;
      if w is not null then sql := sql || format(' with check (%s)', w); end if;
      execute sql;
      n := n + 1;
    end if;
  end loop;
  raise notice 'rewrote % policies', n;
end $$;
