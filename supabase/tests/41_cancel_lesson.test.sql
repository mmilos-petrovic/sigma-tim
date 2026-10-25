-- Cancelling: ordinary lessons vanish, booked slots become free again, the past stays, everybody concerned is told.
begin;
select plan(60);

select tests.seed_basic();
select tests.mklesson('extra',     'ta', 'math', 'L1', null, tests.at(60 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.mklesson('direct',    'ta', 'math', 'L1', null, tests.at(65 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.mklesson('slot_late', 'ta', 'math', 'L1', null, tests.at(11 * 60 + 30), 60, 'open', 'slot');
select tests.mklesson('slot_x',    'ta', 'math', 'L1', null, tests.at(47 * 60), 60, 'open', 'slot');
select tests.mklesson('slot_y',    'ta', 'math', 'L1', null, tests.at(48 * 60), 60, 'open', 'slot');

-- not your lesson -------------------------------------------------------------------------------
select tests.login_as('s2');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'a student cannot cancel a classmate''s lesson');
select tests.login_as('tb');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'a teacher cannot cancel a colleague''s lesson');
select tests.login_as('p2');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'a parent cannot cancel another child''s lesson');
select tests.login_as('su');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'an unassigned student cannot');
select tests.login_as('tc');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'a teacher without lessons cannot');
select tests.login_as('boss');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'an admin who is also a teacher cannot cancel other teachers'' lessons');
select tests.login_as('admin');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'an admin without a teacher role cannot cancel lessons');
select tests.login_as('outsider');
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, '42501', null, 'anon cannot');
select tests.logout();
select is((select count(*)::int from public.lessons where id = tests.id('les:solo')), 1, 'none of that touched the lesson');

-- a student cancels -----------------------------------------------------------------------------
select tests.login_as('s1');
select lives_ok($$ select public.cancel_lesson(tests.id('les:solo')) $$, 'a student cancels their lesson');
select tests.logout();
select is((select count(*)::int from public.lessons where id = tests.id('les:solo')), 0, 'a cancelled ordinary lesson is deleted entirely');
select is(tests.notified('solo'), array['p1', 'ta'], 'the teacher and the parent are told; the student who cancelled is not');
select is(
  (select payload - 'lesson_id' - 'start_at' - 'end_at' - 'cancelled_by'
     from public.notifications
    where kind = 'lesson_cancelled' and recipient_id = tests.id('p:ta') and (payload->>'lesson_id')::uuid = tests.id('les:solo')),
  '{"subject": "Test Matematika", "teacher": "Test Alfa", "location": "Test Centar", "reason": "cancelled"}'::jsonb,
  'the notice carries a snapshot of the lesson, so it survives the deletion'
);

-- one student leaves a group lesson, it goes on for the others ---------------------------------------
select tests.login_as('p1');
select lives_ok($$ select public.cancel_lesson(tests.id('les:group')) $$, 'a parent cancels for their child in a group lesson');
select tests.logout();
select is(
  (select array_agg(student_id) from public.lesson_students where lesson_id = tests.id('les:group')),
  array[tests.id('s:s2')], 'only that child left, the lesson goes on for the classmate'
);
select is((select note from public.lesson_students where lesson_id = tests.id('les:group')), 'note-s2', 'and the classmate''s note is untouched');
select is(tests.notified_left('group'), array['s1', 'ta'],
  'the teacher and the child are told; the parent who did it is not, and the classmate hears nothing');
select is(tests.notified('group'), '{}'::text[], 'this is not a cancellation of the lesson');
select is(
  (select payload->'students' from public.notifications where kind = 'participant_left' and recipient_id = tests.id('p:ta')),
  '["Test Prvi"]'::jsonb, 'the notice names only the student who left'
);

select tests.login_as('s1');
select is((select count(*)::int from public.lessons where id = tests.id('les:group')), 0, 'the child no longer sees that lesson');

select tests.login_as('s2');
select lives_ok($$ select public.cancel_lesson(tests.id('les:group')) $$, 'the last student cancels');
select tests.logout();
select is((select count(*)::int from public.lessons where id = tests.id('les:group')), 0, 'now the lesson is deleted');
select is(tests.notified('group'), array['p2', 'ta'], 'and it counts as a cancellation for the teacher and the parent');

-- the teacher cancels a group lesson: nobody stays ---------------------------------------------------
select tests.mklesson('group2', 'ta', 'math', 'L1', null, tests.at(75 * 60), 60, 'confirmed', 'teacher', array['s1', 's2']);
select tests.login_as('ta');
select lives_ok($$ select public.cancel_lesson(tests.id('les:group2')) $$, 'the teacher cancels a group lesson');
select tests.logout();
select is((select count(*)::int from public.lessons where id = tests.id('les:group2')), 0, 'it is deleted for everybody');
select is(tests.notified('group2'), array['p1', 'p2', 's1', 's2'], 'and everybody is told');

-- a family books a slot, one child leaves, then the rest ----------------------------------------------------
select tests.mkstudent('x1', 'Test', 'X1', 'ta');
select tests.mkstudent('x2', 'Test', 'X2', 'ta');
select tests.mkparent('pm', 'Test', 'Mnogo', array['x1', 'x2']);
select tests.mklesson('slot_f', 'ta', 'math', 'L1', null, tests.at(49 * 60), 60, 'open', 'slot');
select tests.login_as('pm');
select is(public.claim_slot(tests.id('les:slot_f'), array[tests.id('s:x1'), tests.id('s:x2')])::text, 'confirmed', 'a parent books a slot for two children');
select tests.login_as('x1');
select lives_ok($$ select public.cancel_lesson(tests.id('les:slot_f')) $$, 'one of them cancels');
select tests.logout();
select is(
  (select status::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
     from public.lessons l where id = tests.id('les:slot_f')),
  'confirmed/1', 'the booking stands for the other child'
);
select is(tests.notified_left('slot_f'), array['pm', 'ta'], 'the parent and the teacher are told');
select tests.login_as('pm');
select lives_ok($$ select public.cancel_lesson(tests.id('les:slot_f')) $$, 'the parent cancels the rest');
select tests.logout();
select is(
  (select status::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
     from public.lessons l where id = tests.id('les:slot_f')),
  'open/0', 'now the slot is free again'
);
select is(tests.notified('slot_f'), array['ta', 'x2'], 'the teacher and the remaining child are told');

-- the teacher cancels ---------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.cancel_lesson(tests.id('les:extra')) $$, 'a teacher cancels their lesson');
select tests.logout();
select is(tests.notified('extra'), array['p2', 's2'], 'the student and the parent are told');

select tests.login_as('boss');
select lives_ok($$ select public.cancel_lesson(tests.id('les:boss_lesson')) $$, 'an admin-teacher cancels their own lesson');
select tests.logout();
select is(tests.notified('boss_lesson'), array['sb'], 'only the student is told');

-- a booked slot comes back --------------------------------------------------------------------------
select tests.login_as('s1');
select is(public.claim_slot(tests.id('les:slot'), array[tests.id('s:s1')])::text, 'confirmed', 'a student books the slot');
select lives_ok($$ select public.cancel_lesson(tests.id('les:slot')) $$, 'and cancels the booking');
select tests.logout();
select is(
  (select status::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
          || '/' || (confirmed_at is null)::text || '/' || (outcome is null)::text
     from public.lessons l where id = tests.id('les:slot')),
  'open/0/true/true', 'the slot is free again, without participants or confirmation'
);
select is(tests.notified('slot'), array['p1', 'ta'], 'the teacher and the parent are told');
select tests.login_as('s2');
select is(public.claim_slot(tests.id('les:slot'), array[tests.id('s:s2')])::text, 'confirmed', 'somebody else can book the freed slot');

-- a pending booking the teacher cancels ------------------------------------------------------------
select tests.login_as('p1');
select is(public.claim_slot(tests.id('les:slot_late'), array[tests.id('s:s1')])::text, 'pending', 'a late booking');
select tests.login_as('ta');
select lives_ok($$ select public.cancel_lesson(tests.id('les:slot_late')) $$, 'the teacher cancels it');
select tests.logout();
select is(
  (select status::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
     from public.lessons l where id = tests.id('les:slot_late')),
  'open/0', 'the slot is free again'
);
select is(tests.notified('slot_late'), array['p1', 's1'], 'the student and the parent are told');

-- an unbooked slot ------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.cancel_lesson(tests.id('les:slot_x')) $$, 'a teacher removes an open slot');
select tests.logout();
select is((select count(*)::int from public.lessons where id = tests.id('les:slot_x')), 0, 'it is deleted');
select is(tests.notified('slot_x'), '{}'::text[], 'nobody is told, nobody was booked');
select tests.login_as('s1');
select throws_ok($$ select public.cancel_lesson(tests.id('les:slot_y')) $$, 'PT403', null, 'a student cannot remove someone''s open slot');

-- the past stays ------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.cancel_lesson(tests.id('les:past')) $$, 'PT409', 'lesson already started',
  'a teacher cannot cancel a lesson that already started');
select tests.login_as('s1');
select throws_ok($$ select public.cancel_lesson(tests.id('les:past')) $$, 'PT409', 'lesson already started',
  'neither can a student');
select tests.login_as('ta');
select throws_ok($$ delete from public.lessons where id = tests.id('les:past') $$, 'PT409', 'lesson already started',
  'deleting a past lesson directly is refused too');
select tests.logout();
select throws_ok($$ delete from public.lessons where id = tests.id('les:past') $$, 'PT409', 'lesson already started',
  'even the database owner cannot erase history');
select is((select count(*)::int from public.lessons where id = tests.id('les:past')), 1, 'the past lesson is still there');

-- deleting a lesson row directly also queues notices ------------------------------------------------------
select tests.login_as('ta');
select is(tests.affected($$ delete from public.lessons where id = tests.id('les:direct') $$), 1, 'a teacher can delete their own future lesson');
select tests.logout();
select is(tests.notified('direct'), array['p2', 's2'], 'and the participants are told all the same');

-- unknown id ----------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.cancel_lesson(gen_random_uuid()) $$, 'PT404', null, 'unknown lesson');

select tests.logout();
select is((select count(*)::int from public.lessons where id = tests.id('les:tb_lesson')), 1, 'colleagues'' lessons were never touched');

select * from finish();
rollback;
