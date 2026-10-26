-- Reactivating a deactivated teacher.
begin;
select plan(22);

select tests.seed_basic();

-- ta asks for an unassigned student, then the admin deactivates ta. That deletes ta's future lessons, releases s1 and s2
-- and closes the request.
select tests.login_as('ta');
select public.request_takeover(tests.id('s:su'));
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:ta'));
select tests.logout();

select is((select is_active from public.teachers where profile_id = tests.id('p:ta')), false, 'precondition: ta is deactivated');
select is(
  (select count(*)::int from public.list_public_cvs() where first_name = 'Test' and last_name = 'Alfa'), 0,
  'precondition: a deactivated teacher''s CV is hidden'
);

-- who may do it -------------------------------------------------------------------------------------------
select tests.login_as('tb');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'a teacher cannot reactivate a colleague');
select tests.login_as('ta');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'a deactivated teacher cannot reactivate themselves');
select tests.login_as('s1');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'a student cannot');
select tests.login_as('outsider');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, '42501', null, 'anon cannot');
select tests.logout();

-- what it refuses -------------------------------------------------------------------------------------------
select tests.login_as('admin');
select throws_ok($$ select public.reactivate_teacher(gen_random_uuid()) $$, 'PT404', null, 'an unknown teacher');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:s1')) $$, 'PT404', null, 'a person who is not a teacher');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:tb')) $$, 'PT409', null, 'a teacher who is already active');

-- the reactivation itself ------------------------------------------------------------------------------------------
select lives_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, 'the admin reactivates ta');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, 'PT409', null, 'doing it twice is refused');
select tests.logout();

select is((select is_active from public.teachers where profile_id = tests.id('p:ta')), true, 'ta is active again');
select is(
  (select count(*)::int from public.teacher_subjects where teacher_id = tests.id('p:ta')), 1,
  'the teacher''s subjects were kept'
);
select is(
  (select count(*)::int from public.students where id in (tests.id('s:s1'), tests.id('s:s2')) and teacher_id is null), 2,
  'the students released at deactivation stay unassigned'
);
select is(
  (select count(*)::int from public.lessons where teacher_id = tests.id('p:ta') and start_at > now()), 0,
  'deleted future lessons do not come back'
);
select is(
  (select count(*)::int from public.takeover_requests where teacher_id = tests.id('p:ta') and status = 'rejected'), 1,
  'the request closed at deactivation stays closed'
);

select tests.login_anon();
select is(
  (select count(*)::int from public.list_public_cvs() where first_name = 'Test' and last_name = 'Alfa'), 1,
  'the CV is shown again where its switch says so'
);

-- the teacher is a teacher again --------------------------------------------------------------------------------
select tests.login_as('ta');
select ok((select is_teacher from public.my_roles()), 'my_roles() reports the teacher role again');
select is(tests.lesson_keys(), array['les:past'], 'ta sees their own lessons again (the past one survived)');
select lives_ok(
  $$ select public.add_student('after-return@t.test', 'Test', 'Povratak', 'OS', '5', 'a') $$,
  'ta can add a student again'
);
select tests.logout();

-- it is a privilege of the function only --------------------------------------------------------------------------------
select function_privs_are('public', 'reactivate_teacher', array['uuid'], 'anon', array[]::text[], 'anon may not execute it');

select * from finish();
rollback;
