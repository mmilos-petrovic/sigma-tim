-- The teacher marks that a student has paid for a lesson. Per student (a group lesson has up to four), on any lesson that
-- has students, past or future, and it can be undone. Only the lesson's own teacher can change it. The student and a
-- parent read it on their own row; the calendar never needs it.
begin;
select plan(33);

select tests.seed_basic();
select tests.mklesson('pend', 'ta', 'math', 'L1', null, tests.at(5 * 60), 60, 'pending', 'slot', array['s2']);

create function tests.paid_keys(p_lesson_key text) returns text[]
language sql stable as $$
  select coalesce(array_agg(substr(tests.key_of(ls.student_id), 3) order by tests.key_of(ls.student_id)), '{}')
    from public.lesson_students ls
   where ls.lesson_id = tests.id('les:' || p_lesson_key) and ls.paid_at is not null
$$;

-- Nothing is paid to begin with -----------------------------------------------------------------------------------------
select tests.logout();
select is((select count(*)::int from public.lesson_students where paid_at is not null and lesson_id = any (tests.ids('les:'))), 0,
  'no lesson is marked as paid to begin with');

-- The teacher marks one student of a group lesson ---------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), true) $$, 'the teacher marks a student as paid');
select is(tests.paid_keys('group'), array['s1'], 'only that student is paid, not the rest of the group');
select lives_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), true) $$, 'marking again is no error');
select is(tests.paid_keys('group'), array['s1'], 'and changes nothing');
select lives_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s2'), true) $$, 'the other student of the group is marked separately');
select is(tests.paid_keys('group'), array['s1', 's2'], 'both are paid now');

-- ... and takes it back ------------------------------------------------------------------------------------------------------
select lives_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), false) $$, 'the teacher takes it back');
select is(tests.paid_keys('group'), array['s2'], 'only that student is unpaid again');
select lives_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), false) $$, 'taking it back twice is no error');

-- Any lesson with students -----------------------------------------------------------------------------------------------------
select lives_ok($$ select public.set_lesson_paid(tests.id('les:past'), tests.id('s:s1'), true) $$, 'a lesson that is over can be marked');
select lives_ok($$ select public.set_lesson_paid(tests.id('les:solo'), tests.id('s:s1'), true) $$, 'so can one still to come (paid in advance)');
select lives_ok($$ select public.set_lesson_paid(tests.id('les:pend'), tests.id('s:s2'), true) $$, 'and a booking that waits for an answer');
select is(tests.paid_keys('past') || tests.paid_keys('solo') || tests.paid_keys('pend'), array['s1', 's1', 's2'], 'each of them is marked');

-- Nobody else can ---------------------------------------------------------------------------------------------------------------
select tests.login_as('tb');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), true) $$, 'PT403', null, 'a colleague cannot');
select tests.login_as('boss');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), false) $$, 'PT403', null, 'an admin who teaches cannot mark the lessons of others');
select tests.login_as('admin');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), false) $$, 'PT403', null, 'an admin who does not teach cannot');
select tests.login_as('s1');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), true) $$, 'PT403', null, 'a student cannot mark themselves as paid');
select tests.login_as('p1');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), true) $$, 'PT403', null, 'a parent cannot');
select tests.login_as('outsider');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), true) $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), true) $$, '42501', null, 'anon cannot');

-- Only what exists --------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.set_lesson_paid(gen_random_uuid(), tests.id('s:s1'), true) $$, 'PT404', null, 'a lesson that does not exist');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:solo'), tests.id('s:s2'), true) $$, 'PT404', null, 'a student who is not on that lesson');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:slot'), tests.id('s:s1'), true) $$, 'PT404', null, 'a free slot, which has nobody on it');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:group'), tests.id('s:s1'), null) $$, 'PT400', null, 'neither paid nor unpaid is not an answer');

-- Not through the table either ------------------------------------------------------------------------------------------------
select throws_ok($$ update public.lesson_students set paid_at = now() where lesson_id = tests.id('les:solo') $$, '42501', null,
  'the teacher cannot write the column directly');
select tests.login_as('s1');
select throws_ok($$ update public.lesson_students set paid_at = now() where lesson_id = tests.id('les:solo') $$, '42501', null,
  'a student cannot write it either');

-- Who reads it -------------------------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select is((select paid_at is not null from public.lesson_students where lesson_id = tests.id('les:solo')), true, 'a student reads their own mark');
select tests.login_as('p1');
select is((select paid_at is not null from public.lesson_students where lesson_id = tests.id('les:solo') and student_id = tests.id('s:s1')), true,
  'and so does their parent');
select tests.login_as('s2');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:group') and student_id = tests.id('s:s1')), 0,
  'a classmate does not even see the row of another student');

-- The mark stays with the student while the group changes --------------------------------------------------------------------------
select tests.login_as('ta');
select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1'), tests.id('s:s2')]);
select is(tests.paid_keys('group'), array['s2'], 'replacing the group with the same people keeps the marks');
select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1')]);
select public.set_lesson_students(tests.id('les:group'), array[tests.id('s:s1'), tests.id('s:s2')]);
select is(tests.paid_keys('group'), '{}'::text[], 'a student who left and came back is not paid any more');

-- A teacher who is deactivated can no longer change it --------------------------------------------------------------------------
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:ta'));
select tests.login_as('ta');
select throws_ok($$ select public.set_lesson_paid(tests.id('les:past'), tests.id('s:s1'), false) $$, 'PT403', null, 'a deactivated teacher cannot');

select * from finish();
rollback;
