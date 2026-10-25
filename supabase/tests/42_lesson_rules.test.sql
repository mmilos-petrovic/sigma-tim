-- Data rules of lessons, scheduling a lesson, and conflict warnings.
begin;
select plan(44);

select tests.seed_basic();
select tests.mkstudent('x1', 'Test', 'X1', 'ta');
select tests.mkstudent('x2', 'Test', 'X2', 'ta');
select tests.mkstudent('x3', 'Test', 'X3', 'ta');
select tests.mkstudent('x4', 'Test', 'X4', 'ta');
select tests.mkstudent('x5', 'Test', 'X5', 'ta');

-- invariants checked at commit (made immediate here so the tests can see them) ----------------------
set constraints all immediate;

select throws_ok(
  $$ insert into public.lesson_students (lesson_id, student_id) values (tests.id('les:slot'), tests.id('s:s1')) $$,
  '23514', null, 'a free slot has no participants'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(200 * 60), tests.at(201 * 60), 'confirmed', 'teacher') $$,
  '23514', null, 'a future confirmed lesson needs a participant'
);
select throws_ok(
  $$ delete from public.lesson_students where lesson_id = tests.id('les:solo') $$,
  '23514', null, 'the last participant of a future lesson cannot be removed (cancel the lesson instead)'
);
select lives_ok(
  $$ delete from public.lesson_students where lesson_id = tests.id('les:past') $$,
  'history may lose participants, e.g. when a student''s data is erased on request'
);

set constraints all deferred;

-- table constraints ---------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300) + interval '5 minutes', tests.at(360) + interval '5 minutes', 'confirmed', 'teacher') $$,
  '23514', null, 'lessons start on the 15 minute grid'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(350), 'confirmed', 'teacher') $$,
  '23514', null, 'lesson lengths are multiples of 15 minutes'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(240), 'confirmed', 'teacher') $$,
  '23514', null, 'a lesson cannot end before it starts'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(330), 'open', 'slot') $$,
  '23514', null, 'a free slot cannot be 30 minutes'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(390), 'open', 'slot') $$,
  '23514', null, 'a free slot cannot be 90 minutes'
);
select lives_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(345), 'open', 'slot') $$,
  'a free slot can be 45 minutes'
);
select lives_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(360), 'open', 'slot') $$,
  'a free slot can be 60 minutes'
);
select lives_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(390), 'confirmed', 'teacher') $$,
  'a lesson the teacher schedules can be 90 minutes'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(360), 'open', 'teacher') $$,
  '23514', null, 'only slot-origin lessons can be open'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(360), 'pending', 'teacher') $$,
  '23514', null, 'only slot bookings can be pending'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin, outcome)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300), tests.at(360), 'open', 'slot', 'held') $$,
  '23514', null, 'a lesson that did not take place as booked has no outcome'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, room_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.id('room:R3'), tests.at(300), tests.at(360), 'confirmed', 'teacher') $$,
  '23503', null, 'the room must belong to the lesson''s location'
);
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:phys'), tests.id('loc:L1'), tests.at(300), tests.at(360), 'confirmed', 'teacher') $$,
  'PT400', null, 'a teacher can only give lessons in their own subjects'
);

-- participants ----------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.lesson_students (lesson_id, student_id) values (tests.id('les:solo'), tests.id('s:s3')) $$,
  'PT400', null, 'only the teacher''s own students can attend'
);
select tests.mklesson('full', 'ta', 'math', 'L1', null, tests.at(100 * 60), 60, 'confirmed', 'teacher', array['x1', 'x2', 'x3', 'x4']);
select throws_ok(
  $$ insert into public.lesson_students (lesson_id, student_id) values (tests.id('les:full'), tests.id('s:x5')) $$,
  'PT400', null, 'a lesson holds at most four students'
);
select is(public.max_lesson_students(), 4, 'the participant limit is a single constant in the database');

-- schedule_lesson ---------------------------------------------------------------------------------------
select tests.login_as('ta');
select ok(
  public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), tests.id('room:R1'), tests.at(80 * 60), tests.at(81 * 60),
                         array[tests.id('s:s1'), tests.id('s:s2')]) is not null,
  'a teacher schedules a lesson for two students'
);
select is(
  (select l.status::text || '/' || l.origin::text || '/' || (l.confirmed_at is not null)::text || '/'
          || (select count(*) from public.lesson_students ls where ls.lesson_id = l.id)
     from public.lessons l where l.teacher_id = tests.id('p:ta') and l.start_at = tests.at(80 * 60)),
  'confirmed/teacher/true/2', 'it is confirmed at once and has both students'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s3')]) $$,
  'PT403', null, 'a teacher cannot schedule another teacher''s student'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:su')]) $$,
  'PT403', null, 'nor an unassigned student'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[]::uuid[]) $$,
  'PT400', null, 'a lesson needs a student'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60),
                                   array[tests.id('s:x1'), tests.id('s:x2'), tests.id('s:x3'), tests.id('s:x4'), tests.id('s:x5')]) $$,
  'PT400', null, 'five students are too many'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:phys'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s1')]) $$,
  'PT400', null, 'a subject the teacher does not teach'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), tests.id('room:R3'), tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s1')]) $$,
  '23503', null, 'a room of another location'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(83 * 60), tests.at(82 * 60), array[tests.id('s:s1')]) $$,
  '23514', null, 'a lesson that ends before it starts'
);

select tests.login_as('s1');
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s1')]) $$,
  'PT403', null, 'students cannot schedule lessons'
);
select tests.login_as('admin');
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s1')]) $$,
  'PT403', null, 'an admin without a teacher role cannot schedule lessons'
);
select tests.login_as('outsider');
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s1')]) $$,
  'PT403', null, 'an unknown Google account cannot schedule lessons'
);
select tests.login_anon();
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(82 * 60), tests.at(83 * 60), array[tests.id('s:s1')]) $$,
  '42501', null, 'anon cannot schedule lessons'
);

select tests.login_as('boss');
select ok(
  public.schedule_lesson(tests.id('subj:phys'), tests.id('loc:L1'), null, tests.at(90 * 60), tests.at(91 * 60), array[tests.id('s:sb')]) is not null,
  'an admin who is also a teacher schedules lessons for their own students'
);
select is(
  (select teacher_id from public.lessons where start_at = tests.at(90 * 60) and location_id = tests.id('loc:L1')),
  tests.id('p:boss'), 'and is the teacher of that lesson'
);

-- conflict warnings -------------------------------------------------------------------------------------
-- les:group is ta, room R1, from +30h to +31h
select tests.login_as('ta');
select is(
  (select same_teacher::text || '/' || same_room::text
     from public.find_conflicts(tests.id('p:ta'), tests.id('room:R1'), tests.at(30 * 60 + 30), tests.at(31 * 60 + 30))),
  'true/true', 'overlapping lessons of the same teacher in the same room are reported'
);
select is(
  (select same_teacher::text || '/' || same_room::text
     from public.find_conflicts(tests.id('p:tc'), tests.id('room:R1'), tests.at(30 * 60 + 30), tests.at(31 * 60 + 30))),
  'false/true', 'a colleague''s lesson in the same room is a room conflict only'
);
select is(
  (select same_teacher::text || '/' || same_room::text
     from public.find_conflicts(tests.id('p:ta'), null, tests.at(30 * 60 + 30), tests.at(31 * 60 + 30))),
  'true/false', 'without a room only the teacher can conflict'
);
select is(
  (select count(*)::int from public.find_conflicts(tests.id('p:ta'), tests.id('room:R1'), tests.at(31 * 60), tests.at(32 * 60))),
  0, 'back-to-back lessons do not conflict'
);
select is(
  (select count(*)::int from public.find_conflicts(tests.id('p:ta'), tests.id('room:R1'), tests.at(40 * 60), tests.at(41 * 60))),
  0, 'a free slot is not a booking'
);
select is(
  (select count(*)::int from public.find_conflicts(tests.id('p:ta'), tests.id('room:R1'), tests.at(30 * 60), tests.at(31 * 60), tests.id('les:group'))),
  0, 'a lesson being edited does not conflict with itself'
);
select is(
  (select pg_get_function_result('public.find_conflicts(uuid, uuid, timestamptz, timestamptz, uuid)'::regprocedure)),
  'TABLE(teacher_id uuid, location_id uuid, room_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, same_teacher boolean, same_room boolean)',
  'conflicts reveal when and where, never who attends'
);
select tests.login_as('s1');
select throws_ok(
  $$ select * from public.find_conflicts(tests.id('p:ta'), null, tests.at(30 * 60), tests.at(31 * 60)) $$,
  'PT403', null, 'students cannot probe teachers'' calendars'
);
select tests.login_anon();
select throws_ok(
  $$ select * from public.find_conflicts(tests.id('p:ta'), null, tests.at(30 * 60), tests.at(31 * 60)) $$,
  '42501', null, 'anon cannot probe calendars'
);

select tests.logout();
select * from finish();
rollback;
