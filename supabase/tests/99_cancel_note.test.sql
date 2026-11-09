-- A reason for cancelling. The person who cancels (a teacher, a student, a parent) or declines a late booking may add one
-- line, up to 200 characters. It travels only in the notification that is queued for the others, under `note`: the key
-- `reason` already says what kind of cancellation it was. The database keeps nothing else of it, and nobody reads the
-- outbox but the service that sends it.
begin;
select plan(47);

select tests.seed_basic();
select tests.mklesson('bk',    'ta', 'math', 'L1', null, tests.at(40 * 60), 60, 'confirmed', 'slot', array['s2']);   -- a booked free slot
select tests.mklesson('pend',  'ta', 'math', 'L1', null, tests.at(5 * 60), 60, 'pending', 'slot', array['s1']);      -- a late booking
select tests.mklesson('ex1',   'ta', 'math', 'L1', null, tests.at(61 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.mklesson('ex2',   'ta', 'math', 'L1', null, tests.at(62 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.mklesson('ex3',   'ta', 'math', 'L1', null, tests.at(63 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.mklesson('ex4',   'ta', 'math', 'L1', null, tests.at(64 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.mklesson('ex5',   'ta', 'math', 'L1', null, tests.at(66 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.mklesson('ex6',   'ta', 'math', 'L1', null, tests.at(67 * 60), 60, 'confirmed', 'teacher', array['s2']);

-- What the outbox says about a lesson, as postgres: the note of every notice (or '-' where there is none), sorted.
create function tests.notes_of(p_kind text, p_lesson_key text) returns text[]
language sql stable as $$
  select coalesce(array_agg(coalesce(n.payload->>'note', '-') order by split_part(p.email, '@', 1)), '{}')
    from public.notifications n join public.profiles p on p.id = n.recipient_id
   where n.kind = p_kind and (n.payload->>'lesson_id')::uuid = tests.id('les:' || p_lesson_key)
$$;

-- How many notices of the lesson carry the key `note` at all.
create function tests.note_keys(p_kind text, p_lesson_key text) returns int
language sql stable as $$
  select count(*)::int from public.notifications n
   where n.kind = p_kind and (n.payload->>'lesson_id')::uuid = tests.id('les:' || p_lesson_key) and n.payload ? 'note'
$$;

-- One function each, so a call by name is never ambiguous ---------------------------------------------------------------------
select is((select count(*)::int from pg_proc where proname = 'cancel_lesson' and pronamespace = 'public'::regnamespace), 1, 'there is one cancel_lesson');
select is((select count(*)::int from pg_proc where proname = 'decline_booking' and pronamespace = 'public'::regnamespace), 1, 'one decline_booking');
select is((select count(*)::int from pg_proc where proname = 'enqueue_cancellation' and pronamespace = 'private'::regnamespace), 1, 'one enqueue_cancellation');
select is((select count(*)::int from pg_proc where proname = 'enqueue_participant_left' and pronamespace = 'private'::regnamespace), 1, 'one enqueue_participant_left');

-- A student cancels a booked slot ----------------------------------------------------------------------------------------------------
select tests.login_as('s2');
select lives_ok($$ select public.cancel_lesson(tests.id('les:bk'), '  Bolestan sam  ') $$, 'a student cancels a booking with a reason');
select tests.logout();
select is((select status::text from public.lessons where id = tests.id('les:bk')), 'open', 'the slot is free again');
select is(tests.notified('bk'), array['p2', 'ta'], 'the parent and the teacher are told, as without a reason');
select is(tests.notes_of('lesson_cancelled', 'bk'), array['Bolestan sam', 'Bolestan sam'], 'both notices carry the reason, trimmed');
select is(tests.notified('bk', 'cancelled'), array['p2', 'ta'], 'and `reason` still says what happened');

-- A student leaves a group lesson ----------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select lives_ok($$ select public.cancel_lesson(tests.id('les:group'), 'Ne mogu da dođem') $$, 'a student leaves a group lesson with a reason');
select tests.logout();
select is(tests.notified_left('group'), array['p1', 'ta'], 'the teacher and the parent of the one who left are told');
select is(tests.notes_of('participant_left', 'group'), array['Ne mogu da dođem', 'Ne mogu da dođem'], 'with the reason');

-- The teacher declines a late booking ----------------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.decline_booking(tests.id('les:pend'), 'Termin više nije slobodan') $$, 'the teacher declines a late booking with a reason');
select tests.logout();
select is(tests.notified('pend', 'declined'), array['p1', 's1'], 'the student and the parent are told it was declined');
select is(tests.notes_of('lesson_cancelled', 'pend'), array['Termin više nije slobodan', 'Termin više nije slobodan'], 'with the reason');

-- The teacher cancels a lesson ---------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.cancel_lesson(tests.id('les:ex1'), 'Razboleo sam se') $$, 'the teacher cancels a lesson with a reason');
select tests.logout();
select is((select count(*)::int from public.lessons where id = tests.id('les:ex1')), 0, 'the lesson is gone');
select is(tests.notified('ex1', 'cancelled'), array['p2', 's2'], 'the student and the parent are told');
select is(tests.notes_of('lesson_cancelled', 'ex1'), array['Razboleo sam se', 'Razboleo sam se'], 'with the reason');

-- No reason, an empty one and one of blanks all mean none -------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.cancel_lesson(tests.id('les:ex2'), '') $$, 'an empty reason');
select lives_ok($$ select public.cancel_lesson(tests.id('les:ex3'), E'  \n ') $$, 'a reason of blanks');
select lives_ok($$ select public.cancel_lesson(tests.id('les:ex4')) $$, 'no reason at all');
select tests.logout();
select is(tests.notified('ex2'), array['p2', 's2'], 'the notices are queued all the same');
select is(tests.note_keys('lesson_cancelled', 'ex2') + tests.note_keys('lesson_cancelled', 'ex3') + tests.note_keys('lesson_cancelled', 'ex4'), 0,
  'and none of them carries a note');

-- 200 characters are fine, 201 are not ----------------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.cancel_lesson(tests.id('les:ex5'), repeat('š', 200)) $$, '200 characters are fine, counted as characters and not bytes');
select throws_ok($$ select public.cancel_lesson(tests.id('les:ex6'), repeat('š', 201)) $$, 'PT400', null, '201 are refused');
select is((select count(*)::int from public.lessons where id = tests.id('les:ex6')), 1, 'and nothing was cancelled');
select tests.login_as('s2');
select throws_ok($$ select public.cancel_lesson(tests.id('les:ex6'), repeat('x', 201)) $$, 'PT400', null, 'a student is held to the same limit');
select tests.logout();
select is(char_length((tests.notes_of('lesson_cancelled', 'ex5'))[1]), 200, 'the long reason arrived whole');

-- The notices of a slot and of a group lesson treat a missing or blank reason like the others --------------------------------------
select tests.mklesson('bk2',    'ta', 'math', 'L1', null, tests.at(41 * 60), 60, 'confirmed', 'slot', array['s2']);
select tests.mklesson('group3', 'ta', 'math', 'L1', null, tests.at(71 * 60), 60, 'confirmed', 'teacher', array['s1', 's2']);
select tests.mklesson('group4', 'ta', 'math', 'L1', null, tests.at(72 * 60), 60, 'confirmed', 'teacher', array['s1', 's2']);
select tests.login_as('s2');
select lives_ok($$ select public.cancel_lesson(tests.id('les:bk2'), '   ') $$, 'a student cancels a booking with a blank reason');
select tests.login_as('s1');
select lives_ok($$ select public.cancel_lesson(tests.id('les:group3')) $$, 'a student leaves a group lesson with no reason');
select lives_ok($$ select public.cancel_lesson(tests.id('les:group4'), '') $$, 'or an empty one');
select tests.logout();
select is(tests.notified('bk2'), array['p2', 'ta'], 'the notices are queued as always');
select is(tests.note_keys('lesson_cancelled', 'bk2') + tests.note_keys('participant_left', 'group3') + tests.note_keys('participant_left', 'group4'), 0,
  'and none of them carries a note');
select is(tests.notified_left('group3'), array['p1', 'ta'], 'including the one about the group lesson');

-- Declining and leaving refuse a reason that is too long as well ------------------------------------------------------------------
select tests.mklesson('pend2', 'ta', 'math', 'L1', null, tests.at(6 * 60), 60, 'pending', 'slot', array['s1']);
select tests.mklesson('group2', 'ta', 'math', 'L1', null, tests.at(70 * 60), 60, 'confirmed', 'teacher', array['s1', 's2']);
select tests.login_as('ta');
select throws_ok($$ select public.decline_booking(tests.id('les:pend2'), repeat('x', 201)) $$, 'PT400', null, 'a reason that is too long cannot decline a booking');
select is((select status::text from public.lessons where id = tests.id('les:pend2')), 'pending', 'the booking still waits');
select tests.login_as('s1');
select throws_ok($$ select public.cancel_lesson(tests.id('les:group2'), repeat('x', 201)) $$, 'PT400', null, 'nor can it make a student leave a group lesson');
select tests.logout();
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:group2')), 2, 'both are still on it');

-- The reason does not stick to what comes after it --------------------------------------------------------------------------------
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:tb'));
select tests.logout();
select is(tests.note_keys('lesson_cancelled', 'tb_lesson'), 0, 'the next cancellation in the same transaction carries no note');
select is(tests.notified('tb_lesson', 'teacher_deactivated'), array['p1', 's3'], 'and is queued as before');

select tests.mklesson('direct', 'ta', 'math', 'L1', null, tests.at(75 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.login_as('ta');
select lives_ok($$ delete from public.lessons where id = tests.id('les:direct') $$, 'a teacher can still delete a lesson through the table');
select tests.logout();
select is(tests.note_keys('lesson_cancelled', 'direct'), 0, 'that carries no note either');
select is(tests.notified('direct'), array['p2', 's2'], 'but still tells them');

-- Nobody but the service reads the outbox ----------------------------------------------------------------------------------------
select tests.login_as('s2');
select throws_ok($$ select count(*) from public.notifications $$, '42501', null, 'a student cannot read the notices');
select tests.login_as('ta');
select throws_ok($$ select count(*) from public.notifications $$, '42501', null, 'neither can a teacher');
select tests.login_anon();
select throws_ok($$ select public.cancel_lesson(gen_random_uuid(), 'x') $$, '42501', null, 'anon cannot cancel with a reason');

select * from finish();
rollback;
