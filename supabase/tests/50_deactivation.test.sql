-- Deactivating a teacher. (The takeover of unassigned students that used to be tested here was replaced by the enrolment flow
-- in Phase 7d: see 111_retire_takeover and 107.)
begin;
select plan(18);

select tests.seed_basic();

-- deactivating a teacher -----------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.deactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'a teacher cannot deactivate themselves');
select tests.login_as('tb');
select throws_ok($$ select public.deactivate_teacher(tests.id('p:ta')) $$, 'PT403', null, 'nor a colleague');
select tests.login_as('admin');
select throws_ok($$ select public.deactivate_teacher(gen_random_uuid()) $$, 'PT404', null, 'unknown teacher');

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
