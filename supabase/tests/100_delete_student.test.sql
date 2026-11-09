-- Deleting a student. A student record (one person with one teacher) can be deleted by that teacher or by an
-- administrator, but only while it has no lesson recorded as held. A student with even one such lesson stays for good;
-- the database says no however it is asked. Lessons still to come are cancelled (the others on them are told), what the
-- student leaves behind in lessons that never took place goes with them, and a person or a parent left with nothing is
-- removed too, so the email can be used again.
begin;
select plan(63);

select tests.seed_basic();

-- The student to delete, and two parents: one of x alone, one of x and s2 -------------------------------------------------------------------
select tests.mkstudent('x', 'Test', 'Iks', 'ta');
select tests.mkparent('px', 'Test', 'RoditeljX', array['x']);
select tests.mkparent('pxy', 'Test', 'RoditeljXY', array['x', 's2']);

select tests.mklesson('x_past_none',   'ta', 'math', 'L1', null, tests.at(-72 * 60), 60, 'confirmed', 'teacher', array['x']);
select tests.mklesson('x_past_nh',     'ta', 'math', 'L1', null, tests.at(-70 * 60), 60, 'confirmed', 'teacher', array['x']);
update public.lessons set outcome = 'not_held' where id = tests.id('les:x_past_nh');
select tests.mklesson('x_past_pend',   'ta', 'math', 'L1', null, tests.at(-68 * 60), 60, 'pending', 'slot', array['x']);
select tests.mklesson('x_past_shared', 'ta', 'math', 'L1', null, tests.at(-66 * 60), 60, 'confirmed', 'teacher', array['x', 's2']);
select tests.mklesson('x_progress',    'ta', 'math', 'L1', null, tests.at(-30), 60, 'confirmed', 'teacher', array['x']);
select tests.mklesson('x_future',      'ta', 'math', 'L1', null, tests.at(90 * 60), 60, 'confirmed', 'teacher', array['x']);
select tests.mklesson('x_group',       'ta', 'math', 'L1', null, tests.at(92 * 60), 60, 'confirmed', 'teacher', array['x', 's2']);
select tests.mklesson('x_book',        'ta', 'math', 'L1', null, tests.at(94 * 60), 60, 'confirmed', 'slot', array['x']);
select tests.mklesson('x_late',        'ta', 'math', 'L1', null, tests.at(6 * 60), 60, 'pending', 'slot', array['x']);

-- A student with a lesson that was held --------------------------------------------------------------------------------------------------------
select tests.mkstudent('h', 'Test', 'Ha', 'ta');
select tests.mkparent('ph', 'Test', 'RoditeljH', array['h']);
select tests.mklesson('h_held',   'ta', 'math', 'L1', null, tests.at(-48 * 60), 60, 'confirmed', 'teacher', array['h']);
update public.lessons set outcome = 'held' where id = tests.id('les:h_held');
select tests.mklesson('h_future', 'ta', 'math', 'L1', null, tests.at(100 * 60), 60, 'confirmed', 'teacher', array['h']);

-- One person who studies with two teachers ----------------------------------------------------------------------------------------------
select tests.mkstudent('tw', 'Test', 'Blizanac', 'ta');
insert into public.students (profile_id, teacher_id)
values (tests.id('p:tw'), tests.id('p:tb'))
returning tests.reg('s:tw2', id);
select tests.mklesson('tw_a', 'ta', 'math', 'L1', null, tests.at(110 * 60), 60, 'confirmed', 'teacher', array['tw']);
select tests.mklesson('tw_b', 'tb', 'phys', 'L2', 'R3', tests.at(111 * 60), 60, 'confirmed', 'teacher', array['tw2']);

-- People who are more than a student -----------------------------------------------------------------------------------------------------------
select tests.mkteacher('ts', 'Test', 'UciteljUcenik', array['math']);
insert into public.students (profile_id, teacher_id) values (tests.id('p:ts'), tests.id('p:ta')) returning tests.reg('s:ts', id);
select tests.mkperson('as', 'Test', 'AdminUcenik', true);
insert into public.students (profile_id, teacher_id) values (tests.id('p:as'), tests.id('p:ta')) returning tests.reg('s:as', id);
select tests.mkstudent('y1', 'Test', 'Ipsilon', 'ta');
select tests.mkteacher('pt', 'Test', 'UciteljRoditelj', array['math']);
insert into public.parents (profile_id) values (tests.id('p:pt'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:pt'), tests.id('s:y1'));

-- A request to take over an unassigned student ------------------------------------------------------------------------------------------------
insert into public.takeover_requests (student_id, teacher_id) values (tests.id('s:su'), tests.id('p:tc'));

create function tests.lessons_left(p_keys text[]) returns text[]
language sql stable as $$
  select coalesce(array_agg(k order by k), '{}') from unnest(p_keys) as k where exists (select 1 from public.lessons where id = tests.id('les:' || k))
$$;

create function tests.on_lesson(p_key text) returns text[]
language sql stable as $$
  select coalesce(array_agg(substr(tests.key_of(ls.student_id), 3) order by tests.key_of(ls.student_id)), '{}')
    from public.lesson_students ls where ls.lesson_id = tests.id('les:' || p_key)
$$;

-- Not everybody may ------------------------------------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select throws_ok($$ select public.delete_student(tests.id('s:s1')) $$, 'PT403', null, 'a student cannot delete themselves');
select throws_ok($$ select public.delete_student(tests.id('s:s2')) $$, 'PT403', null, 'nor a classmate');
select tests.login_as('p2');
select throws_ok($$ select public.delete_student(tests.id('s:s2')) $$, 'PT403', null, 'a parent cannot delete their child');
select tests.login_as('tb');
select throws_ok($$ select public.delete_student(tests.id('s:x')) $$, 'PT403', null, 'a colleague cannot delete the student of another teacher');
select tests.login_as('tc');
select throws_ok($$ select public.delete_student(tests.id('s:x')) $$, 'PT403', null, 'a teacher without students cannot');
select tests.login_as('ta');
select throws_ok($$ select public.delete_student(tests.id('s:su')) $$, 'PT403', null, 'a teacher cannot delete a student nobody teaches');
select tests.login_as('outsider');
select throws_ok($$ select public.delete_student(tests.id('s:x')) $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select public.delete_student(tests.id('s:x')) $$, '42501', null, 'anon cannot');
select tests.login_as('outsider');
select throws_ok($$ select public.delete_student(gen_random_uuid()) $$, 'PT403', null, 'an unknown Google account is told nothing about which students exist');
select tests.login_as('s1');
select throws_ok($$ select public.delete_student(gen_random_uuid()) $$, 'PT403', null, 'neither is a student');
select tests.login_as('ta');
select throws_ok($$ select public.delete_student(gen_random_uuid()) $$, 'PT404', null, 'a teacher is told that a student does not exist');
select tests.logout();
select is((select count(*)::int from public.students where id = tests.id('s:x')), 1, 'none of that touched the student');

-- A student with a lesson that was held stays, whoever asks ------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.delete_student(tests.id('s:h')) $$, 'PT409', 'a student with a lesson that took place cannot be deleted',
  'the teacher cannot delete a student who has a held lesson');
select tests.login_as('admin');
select throws_ok($$ select public.delete_student(tests.id('s:h')) $$, 'PT409', 'a student with a lesson that took place cannot be deleted',
  'nor can the administrator');
select tests.logout();
select is((select count(*)::int from public.students where id = tests.id('s:h')), 1, 'the student is still there');
select is(tests.lessons_left(array['h_held', 'h_future']), array['h_future', 'h_held'], 'with both lessons');
select is((select count(*)::int from public.profiles where id = tests.id('p:h')) + (select count(*)::int from public.parents where profile_id = tests.id('p:ph')), 2,
  'and the person and the parent');

-- The setting delete_student uses to remove past lessons is no way round the rule ----------------------------------------------------------------
select tests.mklesson('spare', 'ta', 'math', 'L1', null, tests.at(-80 * 60), 60, 'confirmed', 'teacher', array['s2']);
select set_config('app.deleting_student', 'on', true);
select throws_ok($$ delete from public.lessons where id = tests.id('les:h_held') $$, 'PT409', null, 'even with it on, a lesson that was held cannot be deleted');
select lives_ok($$ delete from public.lessons where id = tests.id('les:spare') $$, 'with it on, a past lesson that was not held can');
select set_config('app.deleting_student', '', true);

-- The teacher deletes a student who never had a held lesson ---------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.delete_student(tests.id('s:x')) $$, 'the teacher deletes a student whose lessons were not held, not recorded, or still to come');
select tests.logout();

select is((select count(*)::int from public.students where id = tests.id('s:x')), 0, 'the student record is gone');
select is((select count(*)::int from public.profiles where id = tests.id('p:x')), 0, 'and so is the person, who had no other role');
select is((select count(*)::int from public.profiles where id = tests.id('p:px')) + (select count(*)::int from public.parents where profile_id = tests.id('p:px')), 0,
  'the parent who had only this child is gone entirely');
select is((select count(*)::int from public.profiles where id = tests.id('p:pxy')) + (select count(*)::int from public.parents where profile_id = tests.id('p:pxy')), 2,
  'the parent who has another child stays');
select is((select array_agg(substr(tests.key_of(student_id), 3)) from public.parent_students where parent_id = tests.id('p:pxy')), array['s2'],
  'now a parent of that child alone');

select is(tests.lessons_left(array['x_past_none', 'x_past_nh', 'x_past_pend', 'x_progress']), '{}'::text[],
  'lessons that never took place or were not recorded, with nobody else on them, are gone');
select is(tests.lessons_left(array['x_past_shared']), array['x_past_shared'], 'a past lesson with somebody else on it stays');
select is(tests.on_lesson('x_past_shared'), array['s2'], 'without the student');
select is(tests.lessons_left(array['x_future']), '{}'::text[], 'a lesson still to come is cancelled');
select is(tests.lessons_left(array['x_group']), array['x_group'], 'a group lesson still to come goes on');
select is(tests.on_lesson('x_group'), array['s2'], 'for the others');
select is((select status::text || ':' || coalesce(outcome::text, '-') from public.lessons where id = tests.id('les:x_book')), 'open:-', 'a booked slot is free again');
select is(tests.on_lesson('x_book'), '{}'::text[], 'with nobody on it');
select is((select status::text from public.lessons where id = tests.id('les:x_late')), 'open', 'so is a booking that waited for the teacher');
select is(tests.on_lesson('x_late'), '{}'::text[], 'with nobody on it');

select is(tests.notified('x_future', 'cancelled'), array['pxy'], 'whoever stays is told that the lesson was cancelled; the teacher who did it and the people deleted are not');
select is(tests.notified_left('x_group'), array['pxy'], 'and that the student left the group lesson');
select is(tests.notified('x_book', 'cancelled'), array['pxy'], 'and about the slot');
select is((select count(*)::int from public.notifications where recipient_id = any (array[tests.id('p:x'), tests.id('p:px')])), 0,
  'nothing stays queued for the people who were deleted');

select tests.login_as('ta');
select throws_ok($$ delete from public.lessons where id = tests.id('les:past') $$, 'PT409', null, 'a past lesson still cannot be deleted directly');
select throws_ok($$ delete from public.lessons where id = tests.id('les:x_past_shared') $$, 'PT409', null, 'not even one the student was on');
select lives_ok($$ select public.add_student('x@t.test', 'Test', 'Iks') $$, 'the email of the deleted student is free again');

-- The administrator deletes one of two records of the same person -----------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.delete_student(tests.id('s:tw')) $$, 'the administrator deletes the record with one teacher');
select tests.logout();
select is((select count(*)::int from public.students where profile_id = tests.id('p:tw')), 1, 'the record with the other teacher stays');
select is((select count(*)::int from public.profiles where id = tests.id('p:tw')), 1, 'so does the person');
select is(tests.lessons_left(array['tw_a', 'tw_b']), array['tw_b'], 'and the lesson with the other teacher');
select is(tests.notified('tw_a', 'cancelled'), array['ta', 'tw'], 'this time the teacher is told too, and the person who stays');
select tests.login_as('admin');
select lives_ok($$ select public.delete_student(tests.id('s:tw2')) $$, 'then the other record');
select tests.logout();
select is((select count(*)::int from public.profiles where id = tests.id('p:tw')), 0, 'and now the person goes');

-- Somebody who is more than a student stays ---------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.delete_student(tests.id('s:ts')) $$, 'a teacher''s own student record can be deleted');
select lives_ok($$ select public.delete_student(tests.id('s:as')) $$, 'so can an administrator''s');
select lives_ok($$ select public.delete_student(tests.id('s:y1')) $$, 'and the child of a parent who is a teacher');
select tests.logout();
select is((select count(*)::int from public.teachers where profile_id = tests.id('p:ts')), 1, 'the teacher stays a teacher');
select is((select count(*)::int from public.profiles where id = tests.id('p:as') and is_admin), 1, 'the administrator stays one');
select is((select count(*)::int from public.profiles where id = tests.id('p:pt')) + (select count(*)::int from public.teachers where profile_id = tests.id('p:pt')), 2,
  'the teacher who was a parent stays a teacher');
select is((select count(*)::int from public.parents where profile_id = tests.id('p:pt')), 0, 'but is no longer a parent');
select is((select count(*)::int from public.profiles where id = tests.id('p:y1')), 0, 'while the child, with no other role, is gone');

-- A student nobody teaches: only the administrator, and a takeover request goes with them ------------------------------------------------------
select is((select count(*)::int from public.takeover_requests where student_id = tests.id('s:su')), 1, 'there is a request for the unassigned student');
select tests.login_as('admin');
select lives_ok($$ select public.delete_student(tests.id('s:su')) $$, 'the administrator deletes a student nobody teaches');
select tests.logout();
select is((select count(*)::int from public.takeover_requests where student_id = tests.id('s:su')), 0, 'the request goes with them');
select is((select count(*)::int from public.profiles where id = any (array[tests.id('p:su'), tests.id('p:pu')])), 0, 'and so do the person and the parent');

-- A teacher who is deactivated cannot -----------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:ta'));
select tests.login_as('ta');
select throws_ok($$ select public.delete_student(tests.id('s:s2')) $$, 'PT403', null, 'a deactivated teacher cannot delete a student');
select tests.login_as('admin');
select lives_ok($$ select public.delete_student(tests.id('s:s2')) $$, 'the administrator can: the student is unassigned now');

select * from finish();
rollback;
