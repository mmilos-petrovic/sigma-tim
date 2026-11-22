-- Phase 8c: the limits. Students a teacher adds, lessons made for a teacher, devices of a person, welcome emails an hour,
-- the sign-up cap and the clearing out of sign-ups that were never finished.
begin;
select plan(64);

select tests.seed_basic();
delete from public.notifications where true;

-- who may use what ------------------------------------------------------------------------------------------------------------------
select is(
  (select count(*)::int
     from unnest(array['private.take_rate_slot(text, uuid, integer, interval)', 'private.clear_stale_signups()',
                       'private.limit_lesson_creation()', 'private.limit_push_subscriptions()']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'nobody signed in, and no visitor, can take a place of a limit, clear out sign-ups or run the checks');
select is(
  (select count(*)::int from unnest(array['select', 'insert', 'update', 'delete']) p
    where has_table_privilege('authenticated', 'private.rate_events', p) or has_table_privilege('anon', 'private.rate_events', p)),
  0, 'or read or write what the limits have counted');

-- the counting itself ---------------------------------------------------------------------------------------------------------------
select private.take_rate_slot('probe', tests.id('p:ta'), 3, interval '1 hour') from generate_series(1, 3);
select is((select count(*)::int from private.rate_events where kind = 'probe'), 3, 'three places are taken, one for each ask');
select throws_ok($$ select private.take_rate_slot('probe', tests.id('p:ta'), 3, interval '1 hour') $$, 'PT429', 'too many requests, try again later',
  'the fourth is refused with the code for too many requests');
select is((select count(*)::int from private.rate_events where kind = 'probe'), 3, 'and leaves no trace');
select lives_ok($$ select private.take_rate_slot('probe', tests.id('p:tb'), 3, interval '1 hour') $$, 'somebody else has their own places');
select lives_ok($$ select private.take_rate_slot('other', tests.id('p:ta'), 3, interval '1 hour') $$, 'and so does another kind of thing');
insert into private.rate_events (kind, actor, at) values
  ('window', tests.id('p:tc'), now() - interval '61 minutes'),
  ('window', tests.id('p:tc'), now() - interval '59 minutes');
select lives_ok($$ select private.take_rate_slot('window', tests.id('p:tc'), 2, interval '1 hour') $$,
  'what was done more than the window ago is forgotten: one of the two places is free');
select throws_ok($$ select private.take_rate_slot('window', tests.id('p:tc'), 2, interval '1 hour') $$, 'PT429', null,
  'and what was done a minute inside it is not');

-- students a teacher adds -----------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select is(
  (select count(public.add_student('kid' || i || '@t.test', 'Kid', 'Number' || i, null, null, null, null, null))::int
     from generate_series(1, 30) i),
  30, 'a teacher adds 30 students');
select throws_ok(
  $$ select public.add_student('kid31@t.test', 'Kid', 'Number31', null, null, null, null, null) $$,
  'PT429', 'too many requests, try again later', 'the 31st in a day is refused');
select throws_ok(
  $$ select public.add_unassigned_student('waits1@t.test', 'Wait', 'One', '+381641234567', tests.id('subj:math'), 'Skola', '5') $$,
  'PT429', null, 'so is a student who is to wait for a teacher: it is the same count');
select tests.logout();
select is((select count(*)::int from public.profiles where email in ('kid31@t.test', 'waits1@t.test')), 0,
  'a refused student leaves no person behind, and no welcome email');
select is((select count(*)::int from public.notifications where kind = 'welcome' and payload ->> 'first_name' in ('Kid', 'Wait')),
  30, 'only the 30 who were added were welcomed');

select tests.login_as('tb');
select lives_ok($$ select public.add_student('tb1@t.test', 'Tb', 'One', null, null, null, null, null) $$,
  'another teacher is not held back by it');
select tests.login_as('admin');
select is(
  (select count(public.add_student('adm' || i || '@t.test', 'Adm', 'N' || i, null, null, null, tests.id('p:tb'), null))::int
     from generate_series(1, 35) i),
  35, 'an administrator adds as many as needed (a first lessons import, a school that moves over)');
select is(
  (select count(public.add_unassigned_student('aw' || i || '@t.test', 'Aw', 'N' || i, '+381641234567', tests.id('subj:math'), 'Skola', '5'))::int
     from generate_series(1, 31) i),
  31, 'and so as many students who are to wait for a teacher');
select tests.logout();

select tests.mkteacher('td', 'Test', 'Dje', array['math']);
select tests.mkteacher('te', 'Test', 'Eje', array['math']);
select tests.mkteacher('tf', 'Test', 'Efe', array['math']);
-- tf did 30 in the last 24 hours, but all of them more than a day ago; td did 29 an hour ago; te did 29 of them too
insert into private.rate_events (kind, actor, at)
select 'student_add', tests.id('p:tf'), now() - interval '25 hours' from generate_series(1, 30);
insert into private.rate_events (kind, actor, at)
select 'student_add', tests.id('p:td'), now() - interval '23 hours' from generate_series(1, 29);
insert into private.rate_events (kind, actor, at)
select 'student_add', tests.id('p:te'), now() - interval '23 hours' from generate_series(1, 29);

select tests.login_as('tf');
select lives_ok($$ select public.add_student('tf1@t.test', 'Tf', 'One', null, null, null, null, null) $$,
  'a day is 24 hours: what was done 25 hours ago is forgotten');
select tests.login_as('td');
select lives_ok($$ select public.add_student('td1@t.test', 'Td', 'One', null, null, null, null, null) $$,
  'what was done 23 hours ago still counts: the 30th is allowed');
select throws_ok($$ select public.add_student('td2@t.test', 'Td', 'Two', null, null, null, null, null) $$, 'PT429', null, 'and the 31st is not');
select throws_ok(
  $$ select public.add_unassigned_student('td3@t.test', 'Td', 'Three', '+381641234567', tests.id('subj:math'), 'Skola', '5') $$,
  'PT429', null, 'a student who is to wait for a teacher is counted with the others');
select tests.login_as('te');
select lives_ok(
  $$ select public.add_unassigned_student('te1@t.test', 'Te', 'One', '+381641234567', tests.id('subj:math'), 'Skola', '5') $$,
  'a student who is to wait for a teacher takes one of the places as well');
select throws_ok(
  $$ select public.add_unassigned_student('te2@t.test', 'Te', 'Two', '+381641234567', tests.id('subj:math'), 'Skola', '5') $$,
  'PT429', null, 'until there are none');
select tests.logout();

-- lessons made for a teacher ---------------------------------------------------------------------------------------------------------
select set_config('t.lessons', (select count(*)::text from public.lessons where teacher_id = tests.id('p:ta') and created_at > now() - interval '1 hour'), true);
select tests.mklesson('bulk' || i, 'ta', 'math', 'L1', null, tests.at(200 * 60 + i * 60), 60, 'open', 'slot')
  from generate_series(1, 100 - current_setting('t.lessons')::int) i;
select is((select count(*)::int from public.lessons where teacher_id = tests.id('p:ta') and created_at > now() - interval '1 hour'), 100,
  'a teacher has 100 lessons made in an hour');
select throws_ok($$ select tests.mklesson('over', 'ta', 'math', 'L1', null, tests.at(9000), 60, 'open', 'slot') $$, 'PT429', null,
  'and not a 101st, however it is written');
select lives_ok($$ select tests.mklesson('other_teacher', 'tb', 'phys', 'L2', null, tests.at(9000), 60, 'open', 'slot') $$,
  'another teacher has places of their own');
select tests.login_as('ta');
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(9510), tests.at(9570), array[tests.id('s:s1')]) $$,
  'PT429', 'too many lessons created in an hour, try again later', 'the function for scheduling a lesson is held to it as well');
select tests.logout();

-- a lesson made an hour and a half ago is not counted; one made 45 minutes ago is
update public.lessons set created_at = now() - interval '90 minutes'
 where id in (select id from public.lessons where teacher_id = tests.id('p:ta') and created_at > now() - interval '1 hour' order by id limit 50);
select lives_ok($$ select tests.mklesson('again', 'ta', 'math', 'L1', null, tests.at(9105), 60, 'open', 'slot') $$,
  'what was made an hour and a half ago is forgotten');
update public.lessons set created_at = now() - interval '45 minutes'
 where id in (select id from public.lessons where teacher_id = tests.id('p:ta') and created_at > now() - interval '1 minute'
              and id <> tests.id('les:again') order by id limit 10);
select tests.mklesson('refill' || i, 'ta', 'math', 'L1', null, tests.at(30000 + i * 60), 60, 'open', 'slot')
  from generate_series(1, 49) i;
select is((select count(*)::int from public.lessons where teacher_id = tests.id('p:ta') and created_at > now() - interval '1 hour'), 100,
  'what was made 45 minutes ago still counts, so the hour is full again');
select throws_ok($$ select tests.mklesson('over2', 'ta', 'math', 'L1', null, tests.at(40005), 60, 'open', 'slot') $$, 'PT429', null,
  'and the next one is refused');

-- devices for notifications -----------------------------------------------------------------------------------------------------------
create function tests.add_device(p_person text, p_name text, p_age_minutes integer) returns void
language sql as $$
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, created_at)
  values (tests.id('p:' || p_person), 'https://push.example/' || p_person || '/' || p_name, 'k', 'a',
          now() - make_interval(mins => p_age_minutes))
$$;
create function tests.devices(p_person text) returns text[]
language sql stable as $$
  select coalesce(array_agg(substring(endpoint from '[^/]+$') order by endpoint), '{}')
    from public.push_subscriptions where profile_id = tests.id('p:' || p_person)
$$;

select tests.add_device('s2', 'd' || i, 100 - i) from generate_series(1, 3) i;
select tests.add_device('s1', 'e' || lpad(i::text, 2, '0'), 200 - i) from generate_series(1, 10) i;
select is(cardinality(tests.devices('s1')), 10, 'a person has 10 devices');
select tests.add_device('s1', 'e11', 100);
select is(tests.devices('s1'), array['e02', 'e03', 'e04', 'e05', 'e06', 'e07', 'e08', 'e09', 'e10', 'e11'],
  'the 11th pushes the oldest one out');
select tests.add_device('s1', 'e12', 1000);
select is(tests.devices('s1'), array['e03', 'e04', 'e05', 'e06', 'e07', 'e08', 'e09', 'e10', 'e11', 'e12'],
  'a device that is added is kept even when it is older than all the others: the oldest of the others goes');
select is(tests.devices('s2'), array['d1', 'd2', 'd3'], 'the devices of somebody else are left alone');
select tests.login_as('s1');
select lives_ok($$ insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
                     values (tests.id('p:s1'), 'https://push.example/s1/e13', 'k', 'a') $$,
  'a person adds their own device, as the app does');
select tests.logout();
select is(cardinality(tests.devices('s1')), 10, 'and still has 10');
select is(tests.devices('s1'), array['e03', 'e04', 'e05', 'e06', 'e07', 'e08', 'e09', 'e10', 'e11', 'e13'],
  'the new one is there, and the oldest of all, which was the one added with an old date, is the one that left');

-- the sign-up cap -------------------------------------------------------------------------------------------------------------------
select is((select daily_cap from public.enrolment_settings), 20, 'the sign-up cap is 20 a day');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'enrolment_settings' and column_name = 'daily_cap'),
  '20', 'and it is what a new school starts with');

-- sign-ups that were never finished --------------------------------------------------------------------------------------------------
select tests.mkoutsider('so_old');
select tests.mkoutsider('so_fresh');
select tests.mkoutsider('so_done');
select tests.mkoutsider('so_two');
select tests.login_as('so_old');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.login_as('so_fresh');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.login_as('so_done');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.login_as('so_two');
select public.start_enrolment(tests.id('subj:math'), 'parent');
select public.start_enrolment(tests.id('subj:phys'), 'parent');
select tests.login_as('p1');
select public.start_enrolment(tests.id('subj:phys'), 'parent');
select tests.logout();

select tests.login_as('so_done');
select public.complete_enrolment_profile(
  (select id from public.my_enrolment_requests() limit 1), 'Done', 'Done', '+381642000099', 'Skola', '7', null, null, true);
select tests.logout();

create function tests.age_signup(p_email text, p_days integer, p_subject text default null) returns void
language sql as $$
  update public.enrolment_requests r set created_at = now() - make_interval(days => p_days)
   from public.profiles p
  where p.id = r.applicant_id and p.email = p_email
    and (p_subject is null or r.subject_id = tests.id('subj:' || p_subject))
$$;
create function tests.signups(p_email text) returns integer
language sql stable as $$
  select count(*)::int from public.enrolment_requests r join public.profiles p on p.id = r.applicant_id where p.email = p_email
$$;
create function tests.has_profile(p_email text) returns boolean
language sql stable as $$ select exists (select 1 from public.profiles where email = p_email) $$;

select tests.age_signup('so_old@t.test', 15);
select tests.age_signup('so_fresh@t.test', 13);
select tests.age_signup('so_done@t.test', 20);
select tests.age_signup('so_two@t.test', 15, 'math');
select tests.age_signup('so_two@t.test', 1, 'phys');
select tests.age_signup('p1@t.test', 15, 'phys');

select is(private.clear_stale_signups(), 3, 'three sign-ups that nobody finished in 14 days are deleted');
select is(tests.signups('so_old@t.test'), 0, 'the sign-up of one who never came back is gone');
select ok(not tests.has_profile('so_old@t.test'), 'and so is the profile that was made for it');
select is(tests.signups('so_fresh@t.test'), 1, 'one of 13 days is kept');
select ok(tests.has_profile('so_fresh@t.test'), 'with its profile');
select is(tests.signups('so_done@t.test'), 1, 'a sign-up whose profile was filled in is kept however old it is');
select ok(tests.has_profile('so_done@t.test'), 'with its profile');
select is(tests.signups('so_two@t.test'), 1, 'of two sign-ups of one person the old one goes');
select ok(tests.has_profile('so_two@t.test'), 'and the person stays, for the one that is left');
select is(tests.signups('p1@t.test'), 0, 'the sign-up of a parent who is already a member is deleted too');
select ok(tests.has_profile('p1@t.test'), 'but the parent, who belongs to the school, stays');
select is(private.clear_stale_signups(), 0, 'a second run has nothing to do');
select ok(
  not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'clear-stale-signups' and schedule = '30 3 * * *'),
  'it runs every night (when pg_cron exists)');

-- the nightly clearing out forgets old counts ----------------------------------------------------------------------------------------
insert into private.rate_events (kind, actor, at) values
  ('old', tests.id('p:ta'), now() - interval '49 hours'), ('recent', tests.id('p:ta'), now() - interval '47 hours');
select private.purge_old_records();
select is((select array_agg(kind order by kind) from private.rate_events where kind in ('old', 'recent')), array['recent'],
  'counts older than two days are forgotten, newer ones are kept');

-- welcome emails ----------------------------------------------------------------------------------------------------------------------
create function tests.welcome(p_count integer) returns void
language sql as $$
  insert into public.notifications (recipient_id, kind, payload)
  select tests.id('p:s1'), 'welcome', jsonb_build_object('first_name', 'W' || i) from generate_series(1, p_count) i
$$;
create function tests.others(p_count integer) returns void
language sql as $$
  insert into public.notifications (recipient_id, kind) select tests.id('p:admin'), 'test' from generate_series(1, p_count)
$$;
create function tests.claimed(p_kind text, p_limit integer default 100) returns integer
language sql as $$
  select count(*)::int from jsonb_array_elements(public.claim_notifications(p_limit) -> 'notices') n where n ->> 'kind' = p_kind
$$;
create function tests.sent_welcome(p_count integer, p_minutes_ago integer) returns void
language sql as $$
  update public.notifications set sent_at = now() - make_interval(mins => p_minutes_ago), channel = 'email', attempts = 1
   where id in (select id from public.notifications where kind = 'welcome' and sent_at is null order by id limit p_count)
$$;

delete from public.notifications where true;
select tests.welcome(25);
select tests.others(3);
select is(tests.claimed('welcome'), 20, 'of 25 welcome emails that wait, 20 are taken for the hour');
select is(tests.claimed('welcome'), 0, 'and no more are taken while those 20 are being sent');
select is((select count(*)::int from public.notifications where kind = 'welcome' and attempts = 0), 5, 'the other five stay in the queue, untouched');
select is((select count(*)::int from public.notifications where kind = 'test' and attempts = 1), 3, 'other notices went with them');

-- the 20 went out half an hour ago: the hour is not over
select tests.sent_welcome(20, 30);
select is(tests.claimed('welcome'), 0, 'the ones sent in the last hour use up the places');
update public.notifications set sent_at = now() - interval '61 minutes' where kind = 'welcome' and sent_at is not null;
select is(tests.claimed('welcome'), 5, 'an hour later the five that waited are taken');

delete from public.notifications where true;
select tests.welcome(25);
select tests.sent_welcome(10, 30);
select is(tests.claimed('welcome'), 10, 'ten sent in the last hour leave ten places');

delete from public.notifications where true;
select tests.welcome(150);
select tests.sent_welcome(20, 5);
select tests.others(5);
select is(tests.claimed('test', 100), 5, 'welcome emails over the limit do not keep other notices out of a batch');
select is((select count(*)::int from public.notifications where kind = 'welcome' and attempts > 0 and sent_at is null), 0,
  'and none of them was taken');

delete from public.notifications where true;
select tests.welcome(60);
select is(tests.claimed('welcome', 5), 5, 'the batch size still applies to them');

-- a welcome that gave up or is waiting for later is not counted as sent
delete from public.notifications where true;
select tests.welcome(30);
update public.notifications set attempts = 5 where id in (select id from public.notifications where kind = 'welcome' order by id limit 10);
update public.notifications set deliver_after = now() + interval '2 hours' where id in (select id from public.notifications where kind = 'welcome' and attempts = 0 order by id limit 4);
select is(tests.claimed('welcome'), 16, 'welcome emails that gave up, and those that are held back for later, are not taken or counted');

select * from finish();
rollback;
