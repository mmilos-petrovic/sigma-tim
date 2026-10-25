-- Who sees and changes lessons, participants and notes.
begin;
select plan(48);

select tests.seed_basic();

-- lessons: reading -----------------------------------------------------------------------------
select tests.login_as('admin');
select is(tests.lesson_keys(), array['les:boss_lesson','les:group','les:past','les:slot','les:solo','les:tb_lesson'],
  'admin sees every lesson');

select tests.login_as('ta');
select is(tests.lesson_keys(), array['les:group','les:past','les:slot','les:solo'],
  'a teacher sees only their own lessons (and free slots), not colleagues''');

select tests.login_as('tb');
select is(tests.lesson_keys(), array['les:tb_lesson'], 'another teacher sees only their own lesson');

select tests.login_as('tc');
select is(tests.lesson_keys(), '{}'::text[], 'a teacher without lessons sees none of the colleagues'' lessons');

select tests.login_as('s1');
select is(tests.lesson_keys(), array['les:group','les:past','les:slot','les:solo'],
  'a student sees their lessons and their teacher''s free slot');

select tests.login_as('s2');
select is(tests.lesson_keys(), array['les:group','les:slot'], 'a student does not see other students'' lessons');

select tests.login_as('s3');
select is(tests.lesson_keys(), array['les:tb_lesson'], 'a student of another teacher does not see the first teacher''s slot');

select tests.login_as('su');
select is(tests.lesson_keys(), '{}'::text[], 'an unassigned student sees no lessons and no slots');

select tests.login_as('p1');
select is(tests.lesson_keys(), array['les:group','les:past','les:slot','les:solo','les:tb_lesson'],
  'a parent sees the lessons and slots of all their children');

select tests.login_as('p2');
select is(tests.lesson_keys(), array['les:group','les:slot'], 'a parent sees only their own child''s lessons');

select tests.login_as('pu');
select is(tests.lesson_keys(), '{}'::text[], 'the parent of an unassigned student sees nothing');

select tests.login_as('outsider');
select is(tests.lesson_keys(), '{}'::text[], 'an unknown Google account sees nothing');

select tests.login_anon();
select throws_ok($$ select count(*) from public.lessons $$, '42501', null, 'anon cannot read lessons');

-- participants and notes -----------------------------------------------------------------------
select tests.login_as('ta');
select is((select count(*)::int from public.lesson_students where lesson_id = any(tests.ids('les:'))), 4,
  'a teacher sees all participants of their lessons');

select tests.login_as('s1');
select is((select count(*)::int from public.lesson_students where lesson_id = any(tests.ids('les:'))), 3,
  'a student sees only their own participation');
select is((select note from public.lesson_students where lesson_id = tests.id('les:group')), 'note-s1',
  'a student reads their own note and not their classmate''s');

select tests.login_as('p1');
select is((select count(*)::int from public.lesson_students where lesson_id = any(tests.ids('les:'))), 4,
  'a parent sees participations of all their children');

select tests.login_as('p2');
select is((select note from public.lesson_students where lesson_id = tests.id('les:group')), 'note-s2',
  'a parent reads their own child''s note and not the other child''s');

select tests.login_as('tb');
select is((select count(*)::int from public.lesson_students where lesson_id = any(tests.ids('les:'))), 1,
  'a teacher cannot see who attends a colleague''s lessons');

select tests.login_as('tc');
select is((select count(*)::int from public.lesson_students where lesson_id = any(tests.ids('les:'))), 0,
  'a teacher without lessons sees no participants');

select tests.login_as('admin');
select is((select count(*)::int from public.lesson_students where lesson_id = any(tests.ids('les:'))), 6,
  'admin sees every participation');

-- busy times: colleagues'' lessons without anyone''s identity -------------------------------------
select tests.login_as('tc');
select is(
  (select count(*)::int from public.busy_times(tests.at(0), tests.at(100 * 60))), 4,
  'a teacher sees when colleagues are busy (group, solo, tb_lesson, boss_lesson), but not free slots or past lessons'
);
select is(
  (select pg_get_function_result('public.busy_times(timestamptz, timestamptz)'::regprocedure)),
  'TABLE(teacher_id uuid, location_id uuid, room_id uuid, start_at timestamp with time zone, end_at timestamp with time zone)',
  'busy_times exposes no student, subject or note columns'
);
select tests.login_as('admin');
select is((select count(*)::int from public.busy_times(tests.at(0), tests.at(100 * 60))), 4, 'admin can read busy times');
select tests.login_as('s1');
select throws_ok($$ select * from public.busy_times(tests.at(0), tests.at(100 * 60)) $$, 'PT403', null,
  'students cannot read busy times');
select tests.login_as('p1');
select throws_ok($$ select * from public.busy_times(tests.at(0), tests.at(100 * 60)) $$, 'PT403', null,
  'parents cannot read busy times');
select tests.login_anon();
select throws_ok($$ select * from public.busy_times(tests.at(0), tests.at(100 * 60)) $$, '42501', null,
  'anon cannot execute busy_times');

-- lessons: writing ------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(60 * 60), tests.at(60 * 60 + 45), 'open', 'slot') $$,
  'a teacher can publish a free slot'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:tb'), tests.id('subj:phys'), tests.id('loc:L1'), tests.at(60 * 60), tests.at(61 * 60), 'open', 'slot') $$,
  '42501', null, 'a teacher cannot publish a slot for a colleague'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(62 * 60), tests.at(63 * 60), 'confirmed', 'teacher') $$,
  '42501', null, 'lessons with students are created through schedule_lesson(), not by inserting rows'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(64 * 60), tests.at(65 * 60), 'pending', 'slot') $$,
  '42501', null, 'a teacher cannot fake a pending booking'
);
select is(tests.affected($$ update public.lessons set room_id = tests.id('room:R2') where id = tests.id('les:group') $$), 1,
  'a teacher can change the room of their own lesson');
select is(tests.affected($$ update public.lessons set room_id = tests.id('room:R1') where id = tests.id('les:tb_lesson') $$), 0,
  'a teacher cannot change a colleague''s lesson');
select throws_ok($$ update public.lessons set status = 'open' where id = tests.id('les:group') $$, '42501', null,
  'status changes only through the booking functions');
select throws_ok($$ update public.lessons set teacher_id = tests.id('p:tb') where id = tests.id('les:group') $$, '42501', null,
  'a lesson cannot be handed to another teacher');
select is(tests.affected($$ update public.lesson_students set note = 'updated' where lesson_id = tests.id('les:group') $$), 2,
  'a teacher can write notes for the participants of their lesson');
select is(tests.affected($$ update public.lesson_students set note = 'hacked' where lesson_id = tests.id('les:tb_lesson') $$), 0,
  'a teacher cannot write notes on a colleague''s lesson');
select throws_ok($$ insert into public.lesson_students (lesson_id, student_id) values (tests.id('les:slot'), tests.id('s:s2')) $$,
  '42501', null, 'participants are added only by the booking functions');
select is(tests.affected($$ delete from public.lessons where id = tests.id('les:tb_lesson') $$), 0,
  'a teacher cannot delete a colleague''s lesson');

select tests.login_as('boss');
select is(tests.affected($$ update public.lessons set room_id = tests.id('room:R1') where id = tests.id('les:boss_lesson') $$), 1,
  'an admin who is also a teacher can edit their own lesson');
select is(tests.affected($$ update public.lessons set room_id = tests.id('room:R1') where id = tests.id('les:solo') $$), 0,
  '... but not another teacher''s lesson');

select tests.login_as('admin');
select is(tests.affected($$ update public.lessons set room_id = tests.id('room:R1') where id = tests.id('les:solo') $$), 0,
  'an admin without a teacher role cannot edit lessons');

select tests.login_as('s1');
select is(tests.affected($$ update public.lessons set room_id = tests.id('room:R1') where id = tests.id('les:solo') $$), 0,
  'a student cannot edit a lesson');
select is(tests.affected($$ delete from public.lessons where id = tests.id('les:solo') $$), 0, 'a student cannot delete a lesson directly');
select is(tests.affected($$ update public.lesson_students set note = 'mine' where lesson_id = tests.id('les:solo') $$), 0,
  'a student cannot write notes');

-- outcome ---------------------------------------------------------------------------------------
select tests.login_as('ta');
select is(tests.affected($$ update public.lessons set outcome = 'held' where id = tests.id('les:past') $$), 1,
  'a teacher records the outcome of a finished lesson');
select throws_ok($$ update public.lessons set outcome = 'held' where id = tests.id('les:solo') $$, 'PT400', null,
  'an outcome cannot be recorded before the lesson ended');
select throws_ok($$ update public.lessons set outcome = 'held' where id = tests.id('les:slot') $$, 'PT400', null,
  'an open slot has no outcome');

select tests.logout();
select * from finish();
rollback;
