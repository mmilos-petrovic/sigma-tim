-- Booking a free slot: first one wins, late bookings wait for the teacher, who may confirm or decline.
begin;
select plan(45);

select tests.seed_basic();

-- Extra slots of ta. now() is fixed inside the transaction and `at()` rounds up to the 15 minute grid, so:
--   at(11h30) starts 11:30..11:44 from now  -> always under 12 h  -> late
--   at(12h00) starts 12:00..12:14 from now  -> never under 12 h   -> on time
select tests.mklesson('slot_late',  'ta', 'math', 'L1', null, tests.at(11 * 60 + 30), 60, 'open', 'slot');
select tests.mklesson('slot_late2', 'ta', 'math', 'L1', null, tests.at(11 * 60 + 45), 60, 'open', 'slot');
select tests.mklesson('slot_edge',  'ta', 'math', 'L1', null, tests.at(12 * 60), 60, 'open', 'slot');
select tests.mklesson('slot_past',  'ta', 'math', 'L1', null, tests.at(-120), 60, 'open', 'slot');
select tests.mklesson('slot2',      'ta', 'math', 'L1', null, tests.at(44 * 60), 60, 'open', 'slot');
select tests.mklesson('slot3',      'ta', 'math', 'L1', null, tests.at(45 * 60), 60, 'open', 'slot');
select tests.mklesson('slot4',      'ta', 'math', 'L1', null, tests.at(46 * 60), 60, 'open', 'slot');

-- A parent with five children of ta, to test the participant limit.
select tests.mkstudent('x1', 'Test', 'X1', 'ta');
select tests.mkstudent('x2', 'Test', 'X2', 'ta');
select tests.mkstudent('x3', 'Test', 'X3', 'ta');
select tests.mkstudent('x4', 'Test', 'X4', 'ta');
select tests.mkstudent('x5', 'Test', 'X5', 'ta');
select tests.mkparent('pm', 'Test', 'Mnogo', array['x1', 'x2', 'x3', 'x4', 'x5']);

-- first one wins ---------------------------------------------------------------------------------
select tests.login_as('s1');
select is(public.claim_slot(tests.id('les:slot'), array[tests.id('s:s1')])::text, 'confirmed',
  'a student booking a slot more than 12 hours ahead is confirmed at once');
select is((select status::text from public.lessons where id = tests.id('les:slot')), 'confirmed', 'the lesson is now confirmed');
select ok((select confirmed_at is not null from public.lessons where id = tests.id('les:slot')), 'the confirmation time is recorded');
select is((select origin::text from public.lessons where id = tests.id('les:slot')), 'slot', 'the lesson remembers that it came from a slot');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:slot')), 1, 'the student is the participant');

select tests.login_as('s2');
select throws_ok(
  $$ select public.claim_slot(tests.id('les:slot'), array[tests.id('s:s2')]) $$,
  'PT409', 'slot is already taken', 'the second student cannot take the same slot'
);
select tests.logout();
select is(
  (select array_agg(student_id) from public.lesson_students where lesson_id = tests.id('les:slot')),
  array[tests.id('s:s1')], 'the loser leaves no trace: the first student is still the only participant'
);

-- late booking ----------------------------------------------------------------------------------
select tests.login_as('p1');
select is(public.claim_slot(tests.id('les:slot_late'), array[tests.id('s:s1')])::text, 'pending',
  'a parent booking for their child less than 12 hours ahead leaves the lesson pending');
select is((select status::text from public.lessons where id = tests.id('les:slot_late')), 'pending', 'the lesson waits for the teacher');
select ok((select confirmed_at is null from public.lessons where id = tests.id('les:slot_late')), 'a pending lesson has no confirmation time');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:slot_late')), 1, 'the child is already a participant');

select tests.login_as('s2');
select is(public.claim_slot(tests.id('les:slot_edge'), array[tests.id('s:s2')])::text, 'confirmed',
  'a booking exactly 12 hours ahead is not late');

-- who may book ----------------------------------------------------------------------------------
select tests.login_as('s3');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s3')]) $$, 'PT403', null,
  'a student of another teacher cannot take the slot');
select tests.login_as('su');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:su')]) $$, 'PT403', null,
  'an unassigned student cannot book');
select tests.login_as('pu');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:su')]) $$, 'PT403', null,
  'the parent of an unassigned student cannot book either');
select tests.login_as('p2');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s1')]) $$, 'PT403', null,
  'a parent cannot book for somebody else''s child');
select tests.login_as('s1');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s2')]) $$, 'PT403', null,
  'a student cannot book for a classmate');
select tests.login_as('p1');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s1'), tests.id('s:s3')]) $$, 'PT403', null,
  'every listed student must belong to the slot''s teacher');
select tests.login_as('ta');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s1')]) $$, 'PT403', null,
  'the teacher does not book their own slots on behalf of students here');
select tests.login_as('outsider');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s1')]) $$, 'PT403', null,
  'an unknown Google account cannot book');
select tests.login_anon();
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s1')]) $$, '42501', null,
  'anon cannot book');

-- invalid requests ------------------------------------------------------------------------------
select tests.login_as('s1');
select throws_ok($$ select public.claim_slot(gen_random_uuid(), array[tests.id('s:s1')]) $$, 'PT404', null, 'unknown slot');
select throws_ok($$ select public.claim_slot(tests.id('les:solo'), array[tests.id('s:s1')]) $$, 'PT409', 'slot is already taken',
  'an ordinary lesson is not a free slot');
select throws_ok($$ select public.claim_slot(tests.id('les:slot2'), array[]::uuid[]) $$, 'PT400', null, 'at least one student is required');
select throws_ok($$ select public.claim_slot(tests.id('les:slot_past'), array[tests.id('s:s1')]) $$, 'PT409', 'lesson already started',
  'a slot in the past cannot be booked');

select is(public.claim_slot(tests.id('les:slot4'), array[tests.id('s:s1'), tests.id('s:s1')])::text, 'confirmed',
  'a student listed twice is booked once');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:slot4')), 1, 'duplicates collapse to one participant');

-- participant limit -------------------------------------------------------------------------------
select tests.login_as('pm');
select throws_ok(
  $$ select public.claim_slot(tests.id('les:slot3'), array[tests.id('s:x1'), tests.id('s:x2'), tests.id('s:x3'), tests.id('s:x4'), tests.id('s:x5')]) $$,
  'PT400', null, 'five students are too many for one lesson'
);
select is(
  public.claim_slot(tests.id('les:slot3'), array[tests.id('s:x1'), tests.id('s:x2'), tests.id('s:x3'), tests.id('s:x4')])::text,
  'confirmed', 'four students are allowed'
);
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:slot3')), 4, 'all four are participants');

-- teacher confirms a late booking ---------------------------------------------------------------
select tests.login_as('s1');
select throws_ok($$ select public.confirm_booking(tests.id('les:slot_late')) $$, 'PT403', null, 'the student cannot confirm their own booking');
select tests.login_as('p1');
select throws_ok($$ select public.confirm_booking(tests.id('les:slot_late')) $$, 'PT403', null, 'the parent cannot confirm it either');
select tests.login_as('tb');
select throws_ok($$ select public.confirm_booking(tests.id('les:slot_late')) $$, 'PT403', null, 'another teacher cannot confirm it');
select tests.login_as('ta');
select lives_ok($$ select public.confirm_booking(tests.id('les:slot_late')) $$, 'the teacher confirms the late booking');
select is((select status::text from public.lessons where id = tests.id('les:slot_late')), 'confirmed', 'the lesson is confirmed');
select ok((select confirmed_at is not null from public.lessons where id = tests.id('les:slot_late')), 'and carries its confirmation time');
select throws_ok($$ select public.confirm_booking(tests.id('les:slot_late')) $$, 'PT409', null, 'only pending lessons can be confirmed');
select throws_ok($$ select public.confirm_booking(gen_random_uuid()) $$, 'PT404', null, 'unknown lesson');

-- teacher declines a late booking -----------------------------------------------------------------
select tests.login_as('s2');
select is(public.claim_slot(tests.id('les:slot_late2'), array[tests.id('s:s2')])::text, 'pending', 'another late booking');
select tests.login_as('tb');
select throws_ok($$ select public.decline_booking(tests.id('les:slot_late2')) $$, 'PT403', null, 'another teacher cannot decline it');
select tests.login_as('ta');
select lives_ok($$ select public.decline_booking(tests.id('les:slot_late2')) $$, 'the teacher declines it');
select tests.logout();
select is(
  (select status::text || '/' || (select count(*) from public.lesson_students where lesson_id = tests.id('les:slot_late2'))
     from public.lessons where id = tests.id('les:slot_late2')),
  'open/0', 'declining frees the slot again'
);
select is(
  (select count(*)::int from public.notifications
    where kind = 'lesson_cancelled' and payload->>'reason' = 'declined' and (payload->>'lesson_id')::uuid = tests.id('les:slot_late2')),
  2, 'the student and the parent are told that the booking was declined (the teacher who declined is not)'
);

select tests.login_as('s1');
select is(public.claim_slot(tests.id('les:slot_late2'), array[tests.id('s:s1')])::text, 'pending', 'the freed slot can be booked again');

select tests.login_as('ta');
select throws_ok($$ select public.decline_booking(tests.id('les:slot')) $$, 'PT409', null, 'a confirmed lesson cannot be declined');

select tests.logout();
select * from finish();
rollback;
