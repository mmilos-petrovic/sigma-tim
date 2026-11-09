-- Two read-only functions for the screens that delete students:
--   admin_list_students()   the administrator's list: one row per student record, newest first, with the teacher, the
--                           parents, the locations of the lessons, and how many lessons were held or are still to come
--   student_lesson_counts() the same two counts for the students the caller may delete: all of them for the administrator,
--                           the teacher's own for a teacher
begin;
select plan(36);

select tests.seed_basic();

-- s1: teacher ta, parent p1, lessons at L1 (group, solo, past) -- the past one was held. s3: teacher tb, lesson at L2.
update public.lessons set outcome = 'held' where id = tests.id('les:past');
select tests.mkstudent('z', 'Test', 'Zet', 'ta');
select tests.mkparent('pz1', 'Test', 'Zeta', array['z']);
select tests.mkparent('pz2', 'Test', 'Alfa-z', array['z']);
select tests.mklesson('z_l2',   'ta', 'math', 'L2', 'R3', tests.at(80 * 60), 60, 'confirmed', 'teacher', array['z']);
select tests.mklesson('z_l1',   'ta', 'math', 'L1', null, tests.at(81 * 60), 60, 'confirmed', 'teacher', array['z']);
select tests.mklesson('z_l1b',  'ta', 'math', 'L1', null, tests.at(82 * 60), 60, 'confirmed', 'teacher', array['z']);
select tests.mklesson('z_pend', 'ta', 'math', 'L1', null, tests.at(5 * 60), 60, 'pending', 'slot', array['z']);
-- the same person as s3, with a second teacher
insert into public.students (profile_id, teacher_id) values (tests.id('p:s3'), tests.id('p:ta')) returning tests.reg('s:s3b', id);

-- the list is in the order in which the records were added, the newest first
update public.students set created_at = '2026-01-08 10:00+00' where id = tests.id('s:su');
update public.students set created_at = '2026-01-09 10:00+00' where id = tests.id('s:sb');
update public.students set created_at = '2026-01-10 10:00+00' where id = tests.id('s:s1');
update public.students set created_at = '2026-01-11 10:00+00' where id = tests.id('s:s3');
update public.students set created_at = '2026-01-12 10:00+00' where id = tests.id('s:s2');
update public.students set created_at = '2026-01-13 10:00+00' where id = tests.id('s:z');
update public.students set created_at = '2026-01-14 10:00+00' where id = tests.id('s:s3b');

create function tests.listed() returns text[]
language sql stable as $$
  select coalesce(array_agg(substr(tests.key_of(r.student_id), 3)), '{}')
    from public.admin_list_students() r where r.student_id = any (tests.ids('s:'))
$$;

create function tests.counted() returns text[]
language sql stable as $$
  select coalesce(array_agg(substr(tests.key_of(r.student_id), 3) order by tests.key_of(r.student_id)), '{}')
    from public.student_lesson_counts() r where r.student_id = any (tests.ids('s:'))
$$;

-- Who may read the list ---------------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select * from public.admin_list_students() $$, 'PT403', null, 'a teacher cannot read the administrator''s list');
select tests.login_as('s1');
select throws_ok($$ select * from public.admin_list_students() $$, 'PT403', null, 'a student cannot');
select tests.login_as('p1');
select throws_ok($$ select * from public.admin_list_students() $$, 'PT403', null, 'a parent cannot');
select tests.login_as('outsider');
select throws_ok($$ select * from public.admin_list_students() $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select * from public.admin_list_students() $$, '42501', null, 'anon cannot');
select tests.login_as('boss');
select is(cardinality(tests.listed()), 7, 'an administrator who also teaches can');

-- What the administrator sees ---------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select is(tests.listed(), array['s3b', 'z', 's2', 's3', 's1', 'sb', 'su'], 'every student record, the one added last first');
select is((select count(*)::int from public.admin_list_students() r where r.profile_id = tests.id('p:s3')), 2, 'a person with two teachers is in the list twice, once for each');

select is((select r.first_name || ' ' || r.last_name || ' <' || r.email || '>' from public.admin_list_students() r where r.student_id = tests.id('s:s1')),
  'Test Prvi <s1@t.test>', 'the name and the email');
select is((select r.created_at from public.admin_list_students() r where r.student_id = tests.id('s:s1')), '2026-01-10 10:00+00'::timestamptz,
  'the day the student was added');
select is((select r.teacher_name from public.admin_list_students() r where r.student_id = tests.id('s:s1')), 'Test Alfa', 'the teacher');
select is((select r.teacher_name from public.admin_list_students() r where r.student_id = tests.id('s:su')), null, 'nobody for a student who has no teacher');
select is((select r.teacher_name from public.admin_list_students() r where r.student_id = tests.id('s:s3')), 'Test Beta', 'the teacher of the other record');

select is((select r.parent_names from public.admin_list_students() r where r.student_id = tests.id('s:s1')), array['Test Roditelj1'], 'a parent');
select is((select r.parent_names from public.admin_list_students() r where r.student_id = tests.id('s:z')), array['Test Alfa-z', 'Test Zeta'], 'two parents, by surname');
select is((select r.parent_names from public.admin_list_students() r where r.student_id = tests.id('s:sb')), '{}'::text[], 'none for a student without a parent');

select is((select r.location_names from public.admin_list_students() r where r.student_id = tests.id('s:s1')), array['Test Centar'],
  'the locations are those of the lessons, each once however many lessons there are');
select is((select r.location_names from public.admin_list_students() r where r.student_id = tests.id('s:z')), array['Test Centar', 'Test Zemun'], 'several, by name');
select is((select r.location_names from public.admin_list_students() r where r.student_id = tests.id('s:su')), '{}'::text[], 'none without lessons');
select is((select r.location_names from public.admin_list_students() r where r.student_id = tests.id('s:s3b')), '{}'::text[], 'and a record has only its own lessons');

select is((select r.held_lessons || '/' || r.upcoming_lessons from public.admin_list_students() r where r.student_id = tests.id('s:s1')), '1/2',
  'one lesson held and two still to come');
select is((select r.held_lessons || '/' || r.upcoming_lessons from public.admin_list_students() r where r.student_id = tests.id('s:z')), '0/4',
  'a booking that waits for the teacher counts as still to come');
select is((select r.held_lessons || '/' || r.upcoming_lessons from public.admin_list_students() r where r.student_id = tests.id('s:su')), '0/0', 'nothing for a student without lessons');
select is((select r.held_lessons || '/' || r.upcoming_lessons from public.admin_list_students() r where r.student_id = tests.id('s:s2')), '0/1',
  'a lesson of the group counts for each student on it');

-- A lesson that was not held or never recorded is not "held"; a free slot is not anybody's ----------------------------------------------------
select tests.logout();
select tests.mklesson('s2_nh', 'ta', 'math', 'L1', null, tests.at(-30 * 60), 60, 'confirmed', 'teacher', array['s2']);
update public.lessons set outcome = 'not_held' where id = tests.id('les:s2_nh');
select tests.mklesson('s2_old', 'ta', 'math', 'L1', null, tests.at(-31 * 60), 60, 'confirmed', 'teacher', array['s2']);
select tests.login_as('admin');
select is((select r.held_lessons || '/' || r.upcoming_lessons from public.admin_list_students() r where r.student_id = tests.id('s:s2')), '0/1',
  'not held and not recorded are neither held nor upcoming');

-- What a teacher may delete -------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select is(tests.counted(), array['s1', 's2', 's3b', 'z'], 'a teacher gets the counts of their own students');
select is((select r.held_lessons || '/' || r.upcoming_lessons from public.student_lesson_counts() r where r.student_id = tests.id('s:s1')), '1/2', 'the same numbers');
select is((select r.held_lessons || '/' || r.upcoming_lessons from public.student_lesson_counts() r where r.student_id = tests.id('s:z')), '0/4', 'also for a pending booking');
select tests.login_as('tb');
select is(tests.counted(), array['s3'], 'a colleague gets only theirs');
select tests.login_as('tc');
select is(tests.counted(), '{}'::text[], 'a teacher without students gets none');
select tests.login_as('admin');
select is(tests.counted(), array['s1', 's2', 's3', 's3b', 'sb', 'su', 'z'], 'the administrator gets everybody''s, unassigned students too');
select tests.login_as('s1');
select throws_ok($$ select * from public.student_lesson_counts() $$, 'PT403', null, 'a student cannot ask');
select tests.login_as('p1');
select throws_ok($$ select * from public.student_lesson_counts() $$, 'PT403', null, 'nor a parent');
select tests.login_as('outsider');
select throws_ok($$ select * from public.student_lesson_counts() $$, 'PT403', null, 'nor an unknown Google account');
select tests.login_anon();
select throws_ok($$ select * from public.student_lesson_counts() $$, '42501', null, 'nor anon');

-- A deactivated teacher has nothing to delete --------------------------------------------------------------------------------------------
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:ta'));
select tests.login_as('ta');
select throws_ok($$ select * from public.student_lesson_counts() $$, 'PT403', null, 'a deactivated teacher cannot ask');

select * from finish();
rollback;
