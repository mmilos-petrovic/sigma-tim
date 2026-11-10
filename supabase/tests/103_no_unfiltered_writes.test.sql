-- Supabase's API connections load pg-safeupdate: an UPDATE or DELETE without a WHERE clause is refused there ("UPDATE requires a
-- WHERE clause"), even when it is meant (a table of one row). The test database does not load it, so a function that does
-- this passes every other test and fails in the app. This looks for them in the source of every function the app owns.
-- (A statement is whatever lies between two semicolons: crude, but it names every function that has the problem today, and
-- a false alarm is cleared by writing `where true`.)
begin;
select plan(2);

create function pg_temp.unfiltered_writes() returns text[]
language sql stable as $$
  with statements as (
    -- from the start of an UPDATE or DELETE to the next semicolon (what a `begin` or `then` in front of it does not matter)
    select n.nspname || '.' || p.proname as fn,
           substring(regexp_replace(stmt, '--[^\n]*', '', 'g')
                     from '(?i)(update\s+[\w."]+\s+(?:as\s+\w+\s+)?set\s.*|delete\s+from\s.*)') as sql
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     cross join lateral regexp_split_to_table(p.prosrc, ';') as stmt
     where n.nspname in ('public', 'private')
       and p.prolang in (select oid from pg_language where lanname in ('plpgsql', 'sql'))
  )
  select coalesce(array_agg(distinct fn order by fn), '{}')
    from statements
   where sql is not null and sql !~* '\mwhere\M'
$$;

select is(pg_temp.unfiltered_writes(), '{}'::text[], 'no function updates or deletes without a WHERE clause');

-- the check does see the mistake it is there to catch
create function public.tmp_unfiltered() returns void
language plpgsql as $$
begin
  update public.notification_settings
     set updated_at = now();
end $$;
select is(pg_temp.unfiltered_writes(), array['public.tmp_unfiltered'], 'it names a function that does');

select * from finish();
rollback;
