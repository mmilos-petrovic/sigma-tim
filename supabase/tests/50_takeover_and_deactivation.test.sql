-- Taking over unassigned students, and deactivating a teacher.
begin;
select plan(48);

select tests.seed_basic();
select tests.mkstudent('su2', 'Test', 'Neraspodjeljen2', null);
select tests.mkstudent('su3', 'Test', 'Neraspodjeljen3', null);

-- requests ------------------------------------------------------------------------------------------
select tests.login_as('tb');
select lives_ok($$ select public.request_takeover(tests.id('s:su')) $$, 'a teacher asks to take over an unassigned student');
select throws_ok($$ select public.request_takeover(tests.id('s:su')) $$, 'PT409', null, 'asking twice is refused');
select throws_ok($$ select public.request_takeover(tests.id('s:s1')) $$, 'PT409', null, 'a student who already has a teacher cannot be requested');
select throws_ok($$ select public.request_takeover(gen_random_uuid()) $$, 'PT404', null, 'unknown student');

select tests.login_as('tc');
select lives_ok($$ select public.request_takeover(tests.id('s:su')) $$, 'several teachers may ask for the same student');

select tests.login_as('s1');
select throws_ok($$ select public.request_takeover(tests.id('s:su')) $$, 'PT403', null, 'a student cannot request a takeover');
select tests.login_as('admin');
select throws_ok($$ select public.request_takeover(tests.id('s:su')) $$, 'PT403', null, 'an admin without a teacher role cannot request one');

select tests.login_as('tb');
select is((select count(*)::int from public.takeover_requests where student_id = any(tests.ids('s:'))), 1, 'a teacher sees only their own requests');
select tests.login_as('tc');
select is((select count(*)::int from public.takeover_requests where student_id = any(tests.ids('s:'))), 1, 'a competing teacher sees only theirs');
select tests.login_as('ta');
select is((select count(*)::int from public.takeover_requests where student_id = any(tests.ids('s:'))), 0, 'a teacher who asked for nothing sees nothing');
select tests.login_as('admin');
select is((select count(*)::int from public.takeover_requests where student_id = any(tests.ids('s:'))), 2, 'admin sees every request');
select tests.login_as('s1');
select is((select count(*)::int from public.takeover_requests where student_id = any(tests.ids('s:'))), 0, 'students see no requests');
select tests.login_anon();
select throws_ok($$ select count(*) from public.takeover_requests $$, '42501', null, 'anon cannot read requests');
select tests.login_as('tb');
select throws_ok(
  $$ insert into public.takeover_requests (student_id, teacher_id) values (tests.id('s:su2'), tests.id('p:tb')) $$,
  '42501', null, 'requests are made through request_takeover() only'
);
select throws_ok(
  $$ update public.takeover_requests set status = 'approved' $$,
  '42501', null, 'a teacher cannot approve their own request'
);

-- approving -----------------------------------------------------------------------------------------
select throws_ok(
  $$ select public.approve_takeover((select id from public.takeover_requests where student_id = tests.id('s:su') and teacher_id = tests.id('p:tb'))) $$,
  'PT403', null, 'a teacher cannot approve'
);
select tests.login_as('admin');
select lives_ok(
  $$ select public.approve_takeover((select id from public.takeover_requests where student_id = tests.id('s:su') and teacher_id = tests.id('p:tb'))) $$,
  'admin approves one request'
);
select tests.logout();
select is((select teacher_id from public.students where id = tests.id('s:su')), tests.id('p:tb'), 'the student now belongs to that teacher');
select is(
  (select r.status::text || '/' || (r.resolved_by = tests.id('p:admin') and r.resolved_at is not null)::text
     from public.takeover_requests r where r.student_id = tests.id('s:su') and r.teacher_id = tests.id('p:tb')),
  'approved/true', 'the request records who approved it and when'
);
select is(
  (select r.status::text from public.takeover_requests r where r.student_id = tests.id('s:su') and r.teacher_id = tests.id('p:tc')),
  'rejected', 'competing requests for the same student are closed'
);
select tests.login_as('tc');
select is((select count(*)::int from public.students where id = tests.id('s:su')), 0, 'the other teachers no longer see the student');
select tests.login_as('admin');
select throws_ok(
  $$ select public.approve_takeover((select id from public.takeover_requests where student_id = tests.id('s:su') and teacher_id = tests.id('p:tb'))) $$,
  'PT409', null, 'an approved request cannot be approved again'
);
select throws_ok(
  $$ select public.approve_takeover((select id from public.takeover_requests where student_id = tests.id('s:su') and teacher_id = tests.id('p:tc'))) $$,
  'PT409', null, 'a rejected request cannot be approved'
);

-- rejecting -----------------------------------------------------------------------------------------
select tests.login_as('tc');
select lives_ok($$ select public.request_takeover(tests.id('s:su2')) $$, 'a teacher asks for another student');
select throws_ok(
  $$ select public.reject_takeover((select id from public.takeover_requests where student_id = tests.id('s:su2'))) $$,
  'PT403', null, 'a teacher cannot reject requests'
);
select tests.login_as('admin');
select lives_ok(
  $$ select public.reject_takeover((select id from public.takeover_requests where student_id = tests.id('s:su2'))) $$,
  'admin rejects it'
);
select tests.logout();
select is(
  (select r.status::text || '/' || (select teacher_id is null from public.students where id = r.student_id)::text
     from public.takeover_requests r where r.student_id = tests.id('s:su2')),
  'rejected/true', 'the student stays unassigned'
);

-- deactivating a teacher -----------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.deactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'a teacher cannot deactivate themselves');
select tests.login_as('tb');
select throws_ok($$ select public.deactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'nor a colleague');
select tests.login_as('admin');
select throws_ok($$ select public.deactivate_teacher(gen_random_uuid()) $$, 'PT404', null, 'unknown teacher');

select tests.login_as('ta');
select lives_ok($$ select public.request_takeover(tests.id('s:su3')) $$, 'before leaving, the teacher had asked for a student');

select tests.login_as('admin');
select lives_ok($$ select public.deactivate_teacher(tests.id('p:ta')) $$, 'admin deactivates the teacher');
select tests.logout();
select is((select is_active from public.teachers where profile_id = tests.id('p:ta')), false, 'the teacher is inactive, the account is kept');
select is(
  (select count(*)::int from public.lessons where teacher_id = tests.id('p:ta') and start_at > now()), 0,
  'all future lessons and free slots are deleted'
);
select is(
  (select count(*)::int from public.lessons l join public.lesson_students ls on ls.lesson_id = l.id
    where l.teacher_id = tests.id('p:ta') and l.start_at <= now()),
  1, 'the past lesson and its participants stay for the record'
);
select is(
  (select count(*)::int from public.students where id in (tests.id('s:s1'), tests.id('s:s2')) and teacher_id is null), 2,
  'the teacher''s students become unassigned'
);
select is(tests.notified('group', 'teacher_deactivated'), array['p1', 'p2', 's1', 's2'],
  'participants and parents of a deleted group lesson are told (not the deactivated teacher)');
select is(tests.notified('solo', 'teacher_deactivated'), array['p1', 's1'], 'same for the single lesson');
select is(tests.notified('slot', 'teacher_deactivated'), '{}'::text[], 'a free slot has nobody to tell');
select is(
  (select r.status::text from public.takeover_requests r where r.student_id = tests.id('s:su3') and r.teacher_id = tests.id('p:ta')),
  'rejected', 'the teacher''s open takeover requests are closed'
);

select tests.login_as('ta');
select is(tests.lesson_keys(), '{}'::text[], 'a deactivated teacher no longer sees lessons');
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(60 * 60), tests.at(61 * 60), 'open', 'slot') $$,
  '42501', null, 'nor publish slots'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s1')]) $$,
  'PT403', null, 'nor schedule lessons'
);
select throws_ok($$ select public.request_takeover(tests.id('s:su3')) $$, 'PT403', null, 'nor request students');

select tests.login_as('s1');
select is(tests.lesson_keys(), array['les:past'], 'the student keeps the history of past lessons');
select tests.login_as('tc');
select is((select count(*)::int from public.students where id in (tests.id('s:s1'), tests.id('s:s2'))), 2,
  'every teacher can now see the released students');

select tests.login_anon();
select is(public.get_public_cv('test-alfa'), null, 'the deactivated teacher''s public CV disappears');

select tests.login_as('admin');
select throws_ok($$ select public.deactivate_teacher(tests.id('p:ta')) $$, 'PT409', null, 'deactivating twice is refused');

select tests.logout();
select * from finish();
rollback;
