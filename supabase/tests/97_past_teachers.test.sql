-- A student or parent keeps being able to read the NAME of a teacher they have (or had, and have not cancelled) a lesson
-- with, after the student has moved to another teacher or the teacher has been deactivated. Without it the lessons list
-- cannot say who taught an old lesson. Only the name row of the profile opens up: the teacher's own row, their phone
-- number and classmates stay as hidden as before.
begin;
select plan(31);

select tests.seed_basic();

-- Extra people and lessons --------------------------------------------------------------------------------------------------
select tests.mkstudent('y', 'Test', 'Igor', 'tb');   -- s3's classmate in a lesson of tb
select tests.mkstudent('xs', 'Test', 'Iks', 'ta');   -- only has one future lesson with ta
select tests.mkstudent('z', 'Test', 'Zet', 'ta');    -- never had a lesson, only sees ta's free slot
select tests.mklesson('tb_past',  'tb', 'phys', 'L2', 'R3', tests.at(-72 * 60), 60, 'confirmed', 'teacher', array['s3']);
select tests.mklesson('tb_group', 'tb', 'phys', 'L2', 'R3', tests.at(32 * 60), 60, 'confirmed', 'teacher', array['s3', 'y']);
select tests.mklesson('xs_lesson', 'ta', 'math', 'L1', null, tests.at(80 * 60), 60, 'confirmed', 'teacher', array['xs']);

insert into public.person_phones (profile_id, phone)
select tests.id('p:' || t.k), '+38160' || lpad(t.n::text, 7, '0')
  from unnest(array['ta', 'tb', 'tc', 's3'], array[1, 2, 3, 4]) as t (k, n);

-- Before anybody moves: the current teacher, nothing else ----------------------------------------------------------------------
select tests.login_as('s3');
select is(tests.profile_keys(), array['s3', 'tb'], 'a student reads themselves and their teacher');
select tests.login_as('z');
select is(tests.profile_keys(), array['ta', 'z'], 'a student without lessons reads themselves and their teacher');

-- A student is handed to another teacher -------------------------------------------------------------------------------------------
select tests.logout();
update public.students set teacher_id = tests.id('p:tc') where id in (tests.id('s:s3'), tests.id('s:xs'), tests.id('s:z'));

select tests.login_as('s3');
select is(tests.profile_keys(), array['s3', 'tb', 'tc'], 'the student reads the name of the old teacher as well as the new one');
select is(tests.lesson_keys(), array['les:tb_group', 'les:tb_lesson', 'les:tb_past'], 'and still sees the lessons they had with the old teacher');
select is((select count(*)::int from public.teachers where profile_id = tests.id('p:tb')), 0,
  'but only the name: the old teacher''s teacher row stays hidden');
select is((select count(*)::int from public.teachers where profile_id = tests.id('p:tc')), 1, 'while the current teacher''s row is readable');
select is(tests.phones_seen(), array['p:s3', 'p:tc'], 'the old teacher''s phone number is hidden, the current teacher''s is not');

select tests.login_as('p1');
select is(tests.profile_keys(), array['p1', 's1', 's3', 'ta', 'tb', 'tc'], 'a parent reads the old teacher of their child too');
select is(tests.phones_seen(), array['p:s3', 'p:ta', 'p:tc'], 'but not the old teacher''s phone number');

select tests.login_as('y');
select is(tests.profile_keys(), array['tb', 'y'], 'the classmate who stayed sees no change');
select tests.login_as('s1');
select is(tests.profile_keys(), array['s1', 'ta'], 'a student with no lesson with the old teacher does not read their name');
select tests.login_as('p2');
select is(tests.profile_keys(), array['p2', 's2', 'ta'], 'nor does a parent of such a student');
select tests.login_as('tc');
select ok(exists (select 1 from public.profiles where id = tests.id('p:tb')), 'colleagues still read each other');

-- Taking part is what counts, not seeing a slot ----------------------------------------------------------------------------------
select tests.login_as('z');
select is(tests.profile_keys(), array['tc', 'z'], 'a free slot of the old teacher does not make the old teacher readable');
select is(tests.lesson_keys(), '{}'::text[], 'the slot itself is gone for them');

select tests.login_as('xs');
select is(tests.profile_keys(), array['ta', 'tc', 'xs'], 'a future lesson with the old teacher is enough to read the name');
select lives_ok($$ select public.cancel_lesson(tests.id('les:xs_lesson')) $$, 'the student cancels that lesson');
select is(tests.profile_keys(), array['tc', 'xs'], 'with no lesson left, the old teacher is no longer readable');

-- Leaving a group lesson ends the link too -----------------------------------------------------------------------------------------------
select tests.login_as('s3');
select lives_ok($$ select public.cancel_lesson(tests.id('les:tb_lesson')) $$, 'a student cancels a lesson with the old teacher');
select lives_ok($$ select public.cancel_lesson(tests.id('les:tb_group')) $$, 'and leaves a group lesson');
select is(tests.profile_keys(), array['s3', 'tb', 'tc'], 'the past lesson alone keeps the old teacher readable');

-- Nobody else is opened up ------------------------------------------------------------------------------------------------------------------
select tests.login_as('su');
select is(tests.profile_keys(), array['su'], 'an unassigned student reads only themselves');
select tests.login_as('pu');
select is(tests.profile_keys(), array['pu', 'su'], 'and so does their parent');
select tests.login_as('outsider');
select is(tests.profile_keys(), '{}'::text[], 'an unknown Google account reads nobody');
select tests.login_anon();
select throws_ok($$ select count(*) from public.profiles $$, '42501', null, 'anon cannot read profiles');

-- The teacher is deactivated -----------------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.deactivate_teacher(tests.id('p:ta')) $$, 'the administrator deactivates a teacher');

select tests.login_as('s1');
select is(tests.profile_keys(), array['s1', 'ta'], 'a student with a past lesson still reads the name of the deactivated teacher');
select is((select count(*)::int from public.teachers where profile_id = tests.id('p:ta')), 0, 'but not the teacher row');
select tests.login_as('s2');
select is(tests.profile_keys(), array['s2'], 'a student whose only lessons were deleted no longer does');
select tests.login_as('p1');
select is(tests.profile_keys(), array['p1', 's1', 's3', 'ta', 'tb', 'tc'], 'a parent keeps it through the child who has a past lesson');
select tests.login_as('p2');
select is(tests.profile_keys(), array['p2', 's2'], 'a parent of the other student does not');

select * from finish();
rollback;
