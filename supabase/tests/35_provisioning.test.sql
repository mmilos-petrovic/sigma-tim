-- Pre-approving people: admin adds teachers, teachers add students and their parents.
begin;
select plan(42);

select tests.seed_basic();

-- create_teacher -------------------------------------------------------------------------------------------
select tests.login_as('admin');
select ok(public.create_teacher('new@t.test', 'Nova', 'Nastavnica', array[tests.id('subj:math')]) is not null, 'admin adds a teacher');
select is(
  (select p.user_id is null and t.is_active and (select count(*) from public.teacher_subjects ts where ts.teacher_id = t.profile_id) = 1
     from public.profiles p join public.teachers t on t.profile_id = p.id where p.email = 'new@t.test'),
  true, 'the new teacher is active, has the subject and has not signed in yet'
);
select throws_ok($$ select public.create_teacher('none@t.test', 'No', 'Subjects', array[]::uuid[]) $$, 'PT400', null,
  'a teacher needs at least one subject');
select tests.login_as('ta');
select throws_ok($$ select public.create_teacher('x@t.test', 'X', 'Y', array[tests.id('subj:math')]) $$, 'PT403', null,
  'only admin adds teachers');
select tests.login_as('admin');
select throws_ok($$ select public.create_teacher('new@t.test', 'Nova', 'Nastavnica', array[tests.id('subj:math')]) $$, 'PT409', null,
  'the same teacher cannot be added twice');
select ok(public.create_teacher('p2@t.test', 'Other', 'Name', array[tests.id('subj:phys')]) is not null,
  'a parent can also become a teacher');
select is(
  (select count(*)::int || '/' || min(first_name) from public.profiles where email = 'p2@t.test'), '1/Test',
  'which reuses the existing profile and keeps its name'
);
select ok(public.create_teacher('  NEW2@T.test ', 'Second', 'Teacher', array[tests.id('subj:math')]) is not null, 'emails are normalised');
select throws_ok($$ select public.create_teacher('not an email', 'X', 'Y', array[tests.id('subj:math')]) $$, 'PT400', null, 'invalid emails are refused');

select tests.logout();
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'new@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{}', now(), now());
select tests.reg('u:new', '00000000-0000-4000-8000-0000000000b1');
select tests.login_as('new');
select is(
  (select count(*)::int from public.teachers where profile_id = (select id from public.profiles where email = 'new@t.test')), 1,
  'the new teacher signs in with Google and is recognised as a teacher'
);

-- add_student ---------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select ok(public.add_student('stud@t.test', 'Nov', 'Ucenik', 'Gimnazija', '7', 'B') is not null, 'a teacher adds a student');
select is(
  (select s.teacher_id = tests.id('p:ta') and s.school = 'Gimnazija' and s.grade = '7' and s.class_section = 'B'
     from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'stud@t.test'),
  true, 'the student belongs to that teacher and carries the school data'
);
select throws_ok($$ select public.add_student('x1@t.test', 'X', 'Y', null, null, null, tests.id('p:tb')) $$, 'PT403', null,
  'a teacher cannot add a student to a colleague');

select tests.login_as('admin');
select ok(public.add_student('adm1@t.test', 'Adm', 'Uno', null, null, null, tests.id('p:tb')) is not null, 'admin adds a student to a chosen teacher');
select is((select s.teacher_id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'adm1@t.test'),
  tests.id('p:tb'), 'the student belongs to that teacher');
select ok(public.add_student('adm2@t.test', 'Adm', 'Dos') is not null, 'admin adds a student without a teacher');
select is((select s.teacher_id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'adm2@t.test'),
  null, 'who is then unassigned');

select tests.login_as('boss');
select ok(public.add_student('bossy@t.test', 'Boss', 'Student') is not null, 'an admin who is also a teacher adds a student');
select is((select s.teacher_id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'bossy@t.test'),
  tests.id('p:boss'), 'who defaults to their own student');

select tests.login_as('tb');
select ok(public.add_student('s1@t.test', 'Test', 'Prvi', 'Skola', '5', 'A') is not null,
  'a second teacher can add a person who is already a student elsewhere');
select tests.login_as('s1');
select is((select count(*)::int from public.students where profile_id = tests.id('p:s1')), 2,
  'the student then has two records, one per teacher, behind one account');
select tests.login_as('tb');
select throws_ok($$ select public.add_student('s1@t.test', 'Test', 'Prvi') $$, 'PT409', null, 'but not twice for the same teacher');
select throws_ok($$ select public.add_student('blank@t.test', '  ', 'Y') $$, 'PT400', null, 'names are required');

select tests.login_as('s1');
select throws_ok($$ select public.add_student('x2@t.test', 'X', 'Y') $$, 'PT403', null, 'students cannot add students');
select tests.login_as('p1');
select throws_ok($$ select public.add_student('x2@t.test', 'X', 'Y') $$, 'PT403', null, 'parents cannot add students');
select tests.login_as('outsider');
select throws_ok($$ select public.add_student('x2@t.test', 'X', 'Y') $$, 'PT403', null, 'unknown Google accounts cannot add students');
select tests.login_anon();
select throws_ok($$ select public.add_student('x2@t.test', 'X', 'Y') $$, '42501', null, 'anon cannot add students');

-- add_parent_to_student ---------------------------------------------------------------------------------------------
select tests.login_as('ta');
select ok(public.add_parent_to_student(tests.id('s:s1'), 'newparent@t.test', 'Novi', 'Roditelj') is not null, 'a teacher adds a parent');
select is(
  (select count(*)::int from public.parent_students ps join public.profiles p on p.id = ps.parent_id
    where p.email = 'newparent@t.test' and ps.student_id = tests.id('s:s1')),
  1, 'the parent is linked to the student'
);
select is((select count(*)::int from public.profiles where email = 'newparent@t.test'), 1, 'and the teacher can see the parent');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s3'), 'x@t.test', 'X', 'Y') $$, 'PT403', null,
  'but not for another teacher''s student');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:su'), 'x@t.test', 'X', 'Y') $$, 'PT403', null,
  'nor for an unassigned student');
select tests.login_as('admin');
select ok(public.add_parent_to_student(tests.id('s:su'), 'x@t.test', 'X', 'Y') is not null, 'admin can add a parent to an unassigned student');

select tests.login_as('ta');
select ok(public.add_parent_to_student(tests.id('s:s2'), 'p1@t.test', 'Whoever', 'Else') is not null,
  'an existing parent is linked by email to a second child');
select is(
  (select count(*)::int || '/' || min(first_name) from public.profiles where email = 'p1@t.test'), '1/Test',
  'without a duplicate profile and without renaming them'
);
select tests.login_as('p1');
select is((select count(*)::int from public.students where id = tests.id('s:s2')), 1, 'the parent now sees the second child');

select tests.login_as('ta');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'p2@t.test', 'X', 'Y') $$, 'PT409', null,
  'a child has at most two parents');
select lives_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'newparent@t.test', 'Novi', 'Roditelj') $$,
  'adding the same parent again is harmless');
select tests.logout();
select throws_ok(
  $$ insert into public.parent_students (parent_id, student_id) values (tests.id('p:p2'), tests.id('s:s1')) $$,
  'PT409', null, 'the limit holds at the table level too'
);

select tests.login_as('s1');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'x@t.test', 'X', 'Y') $$, 'PT403', null, 'a student cannot add parents');
select tests.login_as('p1');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'x@t.test', 'X', 'Y') $$, 'PT403', null, 'a parent cannot add parents');
select tests.login_anon();
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'x@t.test', 'X', 'Y') $$, '42501', null, 'anon cannot add parents');

select tests.logout();
select * from finish();
rollback;
