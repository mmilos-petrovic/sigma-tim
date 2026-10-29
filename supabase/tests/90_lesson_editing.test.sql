-- Editing lessons: the day lock (Europe/Belgrade), participants, scheduling and free slots in the past, late answers.
--
-- Rule: subject, location, room and time of a lesson can be changed until 23:59 of the day it was held. After that
-- (and as soon as an outcome is recorded) they are frozen; participants, notes and the outcome stay editable.
begin;
select plan(70);

select tests.seed_basic();
select tests.mkstudent('x1', 'Test', 'X1', 'ta');
select tests.mkstudent('x2', 'Test', 'X2', 'ta');
select tests.mkstudent('x3', 'Test', 'X3', 'ta');
select tests.mkstudent('x4', 'Test', 'X4', 'ta');
select tests.mkstudent('x5', 'Test', 'X5', 'ta');

-- yesterday 22:00-23:00 (always locked), today 00:00-00:15 (started, still open for edits),
-- a lesson held today with an outcome, an expired free slot and a late booking nobody answered
select tests.mklesson('yday',    'ta', 'math', 'L1', 'R1', tests.today_start() - interval '2 hours', 60, 'confirmed', 'teacher', array['s1']);
select tests.mklesson('earlier', 'ta', 'math', 'L1', 'R1', tests.today_start(), 15, 'confirmed', 'teacher', array['s2']);
with l as (
  insert into public.lessons (teacher_id, subject_id, location_id, room_id, start_at, end_at, status, origin, outcome)
  values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.id('room:R1'),
          tests.today_start(), tests.today_start() + interval '15 minutes', 'confirmed', 'teacher', 'held')
  returning id
) select tests.reg('les:held_today', id) from l;
insert into public.lesson_students (lesson_id, student_id) values (tests.id('les:held_today'), tests.id('s:s2'));
select tests.mklesson('slot_past', 'ta', 'math', 'L1', null, tests.at(-120), 60, 'open', 'slot');
select tests.mklesson('late',      'ta', 'math', 'L1', null, tests.at(-30), 60, 'pending', 'slot', array['s1']);
select tests.mklesson('boss_yday', 'boss', 'math', 'L1', null, tests.today_start() - interval '2 hours', 60, 'confirmed', 'teacher', array['sb']);
select tests.mklesson('pending_future', 'ta', 'math', 'L1', null, tests.at(30 * 60), 60, 'pending', 'slot', array['s1']);

-- before the day is over ---------------------------------------------------------------------------
select tests.login_as('ta');
select is(
  tests.affected($$ update public.lessons set start_at = start_at + interval '3 days', end_at = end_at + interval '3 days' where id = tests.id('les:solo') $$),
  1, 'a future lesson can be moved'
);
select is(
  tests.affected($$ update public.lessons set room_id = tests.id('room:R2') where id = tests.id('les:earlier') $$),
  1, 'a lesson that started earlier today can still change room'
);
select is(
  tests.affected($$ update public.lessons set start_at = tests.today_start() + interval '15 minutes', end_at = tests.today_start() + interval '30 minutes' where id = tests.id('les:earlier') $$),
  1, 'and be moved within today'
);
select is(
  tests.affected($$ update public.lessons set start_at = tests.today_start() + interval '1 day', end_at = tests.today_start() + interval '1 day 15 minutes' where id = tests.id('les:earlier') $$),
  1, 'or to a later day'
);
select throws_ok(
  $$ update public.lessons set start_at = tests.today_start() - interval '1 hour', end_at = tests.today_start() - interval '45 minutes' where id = tests.id('les:solo') $$,
  'PT400', null, 'a lesson cannot be moved to a day that has already passed'
);
select throws_ok(
  $$ update public.lessons set start_at = tests.today_start() - interval '15 minutes', end_at = tests.today_start() where id = tests.id('les:solo') $$,
  'PT400', null, 'not even by a quarter of an hour'
);
select is(
  tests.affected($$ update public.lessons set start_at = tests.today_start(), end_at = tests.today_start() + interval '15 minutes' where id = tests.id('les:solo') $$),
  1, 'the first moment of today is fine'
);

-- after midnight ------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.lessons set room_id = tests.id('room:R2') where id = tests.id('les:yday') $$,
  'PT409', null, 'yesterday''s lesson cannot change room'
);
select throws_ok(
  $$ update public.lessons set room_id = null where id = tests.id('les:yday') $$,
  'PT409', null, 'nor drop the room'
);
select throws_ok(
  $$ update public.lessons set location_id = tests.id('loc:L2'), room_id = tests.id('room:R3') where id = tests.id('les:yday') $$,
  'PT409', null, 'nor change location'
);
select throws_ok(
  $$ update public.lessons set start_at = start_at + interval '1 day', end_at = end_at + interval '1 day' where id = tests.id('les:yday') $$,
  'PT409', null, 'nor move to the future'
);
select throws_ok(
  $$ update public.lessons set end_at = end_at + interval '15 minutes' where id = tests.id('les:yday') $$,
  'PT409', null, 'nor change its length'
);
select throws_ok(
  $$ update public.lessons set start_at = start_at + interval '1 day', end_at = end_at + interval '1 day' where id = tests.id('les:past') $$,
  'PT409', null, 'older lessons are frozen as well'
);
select is(
  tests.affected($$ update public.lessons set outcome = 'not_held' where id = tests.id('les:yday') $$),
  1, 'the outcome can still be recorded after the lock'
);
select is(
  tests.affected($$ update public.lesson_students set note = 'late note' where lesson_id = tests.id('les:yday') $$),
  1, 'and so can notes'
);
select is((select note from public.lesson_students where lesson_id = tests.id('les:yday')), 'late note', 'the note is saved');
select throws_ok(
  $$ update public.lessons set room_id = tests.id('room:R2') where id = tests.id('les:yday') $$,
  'PT409', null, 'recording an outcome did not unlock anything'
);

-- an outcome freezes the lesson even on the same day --------------------------------------------------
select throws_ok(
  $$ update public.lessons set room_id = tests.id('room:R2') where id = tests.id('les:held_today') $$,
  'PT409', null, 'a lesson with an outcome cannot change room'
);
select throws_ok(
  $$ update public.lessons set start_at = start_at + interval '1 day', end_at = end_at + interval '1 day' where id = tests.id('les:held_today') $$,
  'PT409', null, 'nor be moved'
);
select throws_ok(
  $$ update public.lessons set outcome = null, room_id = tests.id('room:R2') where id = tests.id('les:held_today') $$,
  'PT409', null, 'clearing the outcome and moving in one statement does not work either'
);
select is(
  tests.affected($$ update public.lessons set outcome = null where id = tests.id('les:held_today') $$),
  1, 'the outcome can be cleared on its own'
);
select is(
  tests.affected($$ update public.lessons set room_id = tests.id('room:R2') where id = tests.id('les:held_today') $$),
  1, 'after which the lesson can change room again, the same day'
);

-- started lessons still cannot be deleted or cancelled ---------------------------------------------
select throws_ok($$ delete from public.lessons where id = tests.id('les:held_today') $$, 'PT409', null, 'a lesson that started today cannot be deleted');
select throws_ok($$ select public.cancel_lesson(tests.id('les:held_today')) $$, 'PT409', null, 'nor cancelled');

-- free slots ----------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(-60), tests.at(0), 'open', 'slot') $$,
  '42501', null, 'a free slot cannot be published in the past'
);
select lives_ok(
  $$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
     values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(120), tests.at(180), 'open', 'slot') $$,
  'a free slot can be published ahead'
);
select is(
  tests.affected($$ update public.lessons set start_at = start_at + interval '1 day', end_at = end_at + interval '1 day' where id = tests.id('les:slot') $$),
  1, 'a free slot can be moved to another time ahead'
);
select throws_ok(
  $$ update public.lessons set start_at = tests.at(-60), end_at = tests.at(0) where id = tests.id('les:slot') $$,
  '42501', null, 'but not into the past'
);
select throws_ok(
  $$ update public.lessons set room_id = tests.id('room:R1') where id = tests.id('les:slot_past') $$,
  '42501', null, 'an expired free slot is left alone'
);

-- the subject is frozen like the rest (boss teaches two subjects, so the change itself is valid)
select tests.login_as('boss');
select throws_ok(
  $$ update public.lessons set subject_id = tests.id('subj:phys') where id = tests.id('les:boss_yday') $$,
  'PT409', null, 'a locked lesson cannot change subject'
);
select is(
  tests.affected($$ update public.lessons set subject_id = tests.id('subj:phys') where id = tests.id('les:boss_lesson') $$),
  1, 'while a lesson ahead can'
);
select throws_ok(
  $$ update public.lessons set location_id = tests.id('loc:L2') where id = tests.id('les:boss_yday') $$,
  'PT409', null, 'a locked lesson cannot change location on its own'
);
select throws_ok(
  $$ update public.lessons set start_at = start_at - interval '15 minutes' where id = tests.id('les:boss_yday') $$,
  'PT409', null, 'nor start earlier while it ends at the same time'
);
select tests.login_as('ta');

-- scheduling ---------------------------------------------------------------------------------------
select lives_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.today_start(), tests.today_start() + interval '15 minutes', array[tests.id('s:s1')]) $$,
  'a lesson can be entered for earlier today'
);
select throws_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.today_start() - interval '15 minutes', tests.today_start(), array[tests.id('s:s1')]) $$,
  'PT400', null, 'but not for yesterday'
);

-- participants -----------------------------------------------------------------------------------------
select lives_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s2')]) $$, 'a teacher removes a student from a lesson');
select is(
  (select array_agg(student_id) from public.lesson_students where lesson_id = tests.id('les:group')),
  array[tests.id('s:s2')], 'only the other student stays'
);
select is((select note from public.lesson_students where lesson_id = tests.id('les:group')), 'note-s2', 'and keeps their note');
select lives_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1'), tests.id('s:s2'), tests.id('s:s1')]) $$,
  'a student is added back (a repeated id counts once)');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:group')), 2, 'two students attend');
select is(
  (select note from public.lesson_students where lesson_id = tests.id('les:group') and student_id = tests.id('s:s2')),
  'note-s2', 'the student who stayed throughout still has the note'
);
select lives_ok(
  $$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:x1'), tests.id('s:x2'), tests.id('s:x3'), tests.id('s:x4')]) $$,
  'four students are the most'
);
select lives_ok(
  $$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:x1'), tests.id('s:x2'), tests.id('s:x3'), tests.id('s:x4'), tests.id('s:x1')]) $$,
  'a repeated id counts once, so four different students fit'
);
select lives_ok(
  $$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:x1'), null, tests.id('s:x2')]) $$,
  'an empty entry in the list is ignored'
);
select throws_ok(
  $$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:x1'), tests.id('s:x2'), tests.id('s:x3'), tests.id('s:x4'), tests.id('s:x5')]) $$,
  'PT400', null, 'five are too many'
);
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), array[]::uuid[]) $$, 'PT400', null, 'a lesson keeps at least one student');
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), null) $$, 'PT400', null, 'a missing list is an invalid request');
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s3')]) $$, 'PT403', null, 'only the teacher''s own students');
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:su')]) $$, 'PT403', null, 'not an unassigned student either');
select throws_ok($$ select public.set_lesson_students(tests.id('les:tb_lesson'), array[tests.id('s:s1')]) $$, 'PT403', null, 'not a colleague''s lesson');
select throws_ok($$ select public.set_lesson_students(tests.id('les:slot'), array[tests.id('s:s1')]) $$, 'PT409', null, 'a free slot is booked by claim_slot, not here');
select throws_ok($$ select public.set_lesson_students(tests.id('les:pending_future'), array[tests.id('s:s2')]) $$, 'PT409', null, 'a booking waits for the teacher''s answer first');
select throws_ok($$ select public.set_lesson_students(gen_random_uuid(), array[tests.id('s:s1')]) $$, 'PT404', null, 'an unknown lesson');
select lives_ok($$ select public.set_lesson_students(tests.id('les:yday'), array[tests.id('s:s1'), tests.id('s:s2')]) $$,
  'participants of a locked lesson can still be corrected');
select tests.login_as('s1');
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1')]) $$, 'PT403', null, 'a student cannot');
select tests.login_as('admin');
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1')]) $$, 'PT403', null, 'an admin without a teacher role cannot');
select throws_ok($$ select public.set_lesson_students(gen_random_uuid(), array[tests.id('s:s1')]) $$, 'PT403', null,
  'and learns nothing about which lessons exist');
select tests.login_as('outsider');
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1')]) $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1')]) $$, '42501', null, 'anon cannot');

-- late answers ---------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.decline_booking(tests.id('les:late')) $$, 'PT409', null, 'a booking cannot be declined once the lesson has started');
select lives_ok($$ select public.confirm_booking(tests.id('les:late')) $$, 'but it can still be confirmed, so the outcome can be recorded');
select is((select status::text from public.lessons where id = tests.id('les:late')), 'confirmed', 'and it is confirmed');
select lives_ok($$ select public.decline_booking(tests.id('les:pending_future')) $$, 'a booking ahead can still be declined');

-- the school day is the Belgrade day, whatever the server clock says (UTC+1 in winter, UTC+2 in summer)
select tests.logout();
select is(private.school_day_start('2026-11-02 22:30+00'), '2026-11-01 23:00+00'::timestamptz, 'winter, 23:30 local: the day began at 00:00 local');
select is(private.school_day_end('2026-11-02 22:30+00'),   '2026-11-02 23:00+00'::timestamptz, 'and ends at 00:00 local the next day');
select is(private.school_day_start('2026-11-02 23:30+00'), '2026-11-02 23:00+00'::timestamptz, 'at 00:30 local it is already the next day (not yet in UTC)');
select is(private.school_day_start('2026-07-15 22:30+00'), '2026-07-15 22:00+00'::timestamptz, 'summer, 00:30 local: the next day began at 22:00 UTC');
select is(private.school_day_end('2026-07-15 21:30+00'),   '2026-07-15 22:00+00'::timestamptz, 'and 23:30 local belongs to the day ending at 22:00 UTC');
select is(private.school_day_end('2026-03-29 12:00+00'),   '2026-03-29 22:00+00'::timestamptz, 'the 23 hour day when the clocks go forward');
select is(private.school_day_end('2026-10-25 12:00+00'),   '2026-10-25 23:00+00'::timestamptz, 'and the 25 hour day when they go back');

select * from finish();
rollback;
