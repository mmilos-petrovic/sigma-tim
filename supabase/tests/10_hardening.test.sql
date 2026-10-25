begin;
select plan(9);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS is enabled on every table in public'
);

select is(
  (select count(*)::int
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and has_any_column_privilege('anon', c.oid, 'select,insert,update,references')),
  0,
  'anon has no privileges on any table or view in public'
);

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')),
  array['get_public_cv', 'list_public_cvs'],
  'anon can only execute the two public CV functions'
);

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0,
  'every security definer function pins its search_path'
);

select is(
  (select count(*)::int
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and has_table_privilege('authenticated', c.oid, 'truncate,trigger')),
  0,
  'authenticated can neither truncate nor create triggers on any table'
);

select tests.seed_basic();

-- notifications is an outbox for the service role only
select tests.login_as('ta');
select throws_ok($$ select count(*) from public.notifications $$, '42501', null, 'teachers cannot read the notification outbox');
select tests.login_as('admin');
select throws_ok($$ select count(*) from public.notifications $$, '42501', null, 'not even admin can read the notification outbox');

-- the identity tables are only written through RPCs
select tests.login_as('ta');
select throws_ok(
  $$ insert into public.profiles (email, first_name, last_name) values ('x@t.test', 'X', 'Y') $$,
  '42501', null, 'teachers cannot insert profiles directly'
);
select throws_ok(
  $$ update public.profiles set is_admin = true where id = tests.id('p:ta') $$,
  '42501', null, 'nobody can promote themselves to admin'
);

select tests.logout();
select * from finish();
rollback;
