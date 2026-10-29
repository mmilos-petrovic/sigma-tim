-- A teacher corrects the names of their students and of those students' parents (never an email), and unlinks a
-- parent who was added by mistake. A wrong parent email is fixed by removing that parent and adding the right one.
begin;
select plan(54);

select tests.seed_basic();
-- tc is a teacher and, as a private person, also a student of ta
insert into public.students (profile_id, teacher_id) values (tests.id('p:tc'), tests.id('p:ta'));
-- a second parent for s1, so that s1 has two
select tests.mkparent('p3', 'Test', 'Roditelj3', array['s1']);
-- p1 is a parent of s1 (ta) and s3 (tb)
-- the admin is, privately, a parent of s2
insert into public.parents (profile_id) values (tests.id('p:admin'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:admin'), tests.id('s:s2'));

-- rename ------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.rename_person(tests.id('p:s1'), '  Petar ', ' Petrović ') $$, 'a teacher renames their student');
select is(
  (select first_name || '|' || last_name || '|' || email from public.profiles where id = tests.id('p:s1')),
  'Petar|Petrović|s1@t.test', 'the name is trimmed and the email is untouched'
);
select lives_ok($$ select public.rename_person(tests.id('p:p2'), 'Jelena', 'Jović') $$, 'and the parent of their student');
select lives_ok($$ select public.rename_person(tests.id('p:p1'), 'Marija', 'Marić') $$,
  'also a parent who has another child with another teacher (the name belongs to the person)');
select throws_ok($$ select public.rename_person(tests.id('p:s3'), 'X', 'Y') $$, 'PT403', null, 'not a colleague''s student');
select throws_ok($$ select public.rename_person(tests.id('p:su'), 'X', 'Y') $$, 'PT403', null, 'not an unassigned student');
select throws_ok($$ select public.rename_person(tests.id('p:pu'), 'X', 'Y') $$, 'PT403', null, 'nor the parent of an unassigned student');
select throws_ok($$ select public.rename_person(tests.id('p:tb'), 'X', 'Y') $$, 'PT403', null, 'not a colleague');
select throws_ok($$ select public.rename_person(tests.id('p:tc'), 'X', 'Y') $$, 'PT403', null, 'not a colleague who also happens to be their student');
select throws_ok($$ select public.rename_person(tests.id('p:admin'), 'X', 'Y') $$, 'PT403', null, 'not the admin, even as a parent of their student');
select throws_ok($$ select public.rename_person(tests.id('p:boss'), 'X', 'Y') $$, 'PT403', null, 'not an admin who teaches');
select throws_ok($$ select public.rename_person(tests.id('p:ta'), 'X', 'Y') $$, 'PT403', null, 'not themselves (that is done on the profile)');
select throws_ok($$ select public.rename_person(gen_random_uuid(), 'X', 'Y') $$, 'PT403', null, 'an unknown person looks the same as a forbidden one');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), '   ', 'Y') $$, 'PT400', null, 'a first name is required');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', '') $$, 'PT400', null, 'and a last name');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), null, 'Y') $$, 'PT400', null, 'null is not a name');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), repeat('x', 101), 'Y') $$, 'PT400', null, 'names have a limit');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', repeat('y', 101)) $$, 'PT400', null, 'and so does the last name');
select is((select first_name from public.profiles where id = tests.id('p:s1')), 'Petar', 'none of the refused calls changed anything');

select tests.login_as('tb');
select lives_ok($$ select public.rename_person(tests.id('p:p1'), 'Marija', 'Marić-Ilić') $$, 'the other teacher sees the same parent and may rename too');
select tests.login_as('ta');
select is((select last_name from public.profiles where id = tests.id('p:p1')), 'Marić-Ilić', 'one name for one person');

select tests.login_as('boss');
select lives_ok($$ select public.rename_person(tests.id('p:sb'), 'Bojan', 'Bošković') $$, 'an admin who teaches renames their own student');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', 'Y') $$, 'PT403', null, 'but not other teachers'' students');
select tests.login_as('admin');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', 'Y') $$, 'PT403', null, 'an admin without a teacher role goes through other functions');
select tests.login_as('s1');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', 'Y') $$, 'PT403', null, 'a student cannot');
select tests.login_as('p1');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', 'Y') $$, 'PT403', null, 'nor a parent');
select tests.login_as('outsider');
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', 'Y') $$, 'PT403', null, 'nor an unknown Google account');
select tests.login_anon();
select throws_ok($$ select public.rename_person(tests.id('p:s1'), 'X', 'Y') $$, '42501', null, 'nor anon');

-- unlink a parent -------------------------------------------------------------------------------------------
select tests.login_as('tb');
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), tests.id('p:p1')) $$, 'PT403', null, 'another teacher cannot unlink a parent');
select tests.login_as('ta');
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:su'), tests.id('p:pu')) $$, 'PT403', null, 'nor can a teacher for an unassigned student');
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), tests.id('p:p2')) $$, 'PT404', null, 'a parent who is not linked to that student');
select throws_ok($$ select public.remove_parent_from_student(gen_random_uuid(), tests.id('p:p1')) $$, 'PT403', null, 'an unknown student');

select lives_ok($$ select public.remove_parent_from_student(tests.id('s:s2'), tests.id('p:p2')) $$, 'a teacher unlinks the parent of their student');
-- the teacher no longer sees this parent at all, so the checks look at the tables directly
select tests.logout();
select is(
  (select count(*)::int from public.parent_students where parent_id = tests.id('p:p2')),
  0, 'the link is gone'
);
select is(
  (select count(*)::int from public.parents where profile_id = tests.id('p:p2')),
  0, 'a parent with no children left loses the parent role'
);
select is(
  (select count(*)::int from public.profiles where id = tests.id('p:p2')),
  1, 'the profile itself stays'
);
select tests.login_as('ta');

select lives_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), tests.id('p:p1')) $$, 'a parent with another child is unlinked from this one only');
select tests.logout();
select is(
  (select array_agg(tests.key_of(student_id) order by tests.key_of(student_id)) from public.parent_students where parent_id = tests.id('p:p1')),
  array['s:s3'], 'and stays linked to the other child'
);
select is((select count(*)::int from public.parents where profile_id = tests.id('p:p1')), 1, 'and keeps the parent role');
select is(
  (select array_agg(tests.key_of(parent_id) order by tests.key_of(parent_id)) from public.parent_students where student_id = tests.id('s:s1')),
  array['p:p3'], 'the other parent of the child is untouched'
);
select tests.login_as('ta');

-- room for a replacement: a student has at most two parents
select lives_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'p1@t.test', 'Test', 'Roditelj1') $$, 'a second parent fits again');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'novi@t.test', 'Novi', 'Roditelj') $$, 'PT409', null, 'a third does not');
select lives_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), tests.id('p:p3')) $$, 'after unlinking one');
select lives_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'novi@t.test', 'Novi', 'Roditelj') $$, 'the corrected parent is added by the right email');

-- what an unlinked parent can no longer see
select tests.login_as('p2');
select is((select count(*)::int from public.students where id = tests.id('s:s2')), 0, 'an unlinked parent no longer sees the child');
select is((select count(*)::int from public.lessons where id = tests.id('les:group')), 0, 'nor the child''s lessons');

select tests.login_as('boss');
select lives_ok($$ select public.add_parent_to_student(tests.id('s:sb'), 'bp@t.test', 'Bo', 'Parent') $$, 'a parent is added to the boss''s student');
select lives_ok($$ select public.remove_parent_from_student(tests.id('s:sb'), (select id from public.profiles where email = 'bp@t.test')) $$,
  'an admin who teaches unlinks a parent of their own student');
select tests.login_as('admin');
select lives_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), (select id from public.profiles where email = 'novi@t.test')) $$,
  'an admin unlinks a parent of any student, as they may add one');
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), (select id from public.profiles where email = 'novi@t.test')) $$,
  'PT404', null, 'a link that is already gone');
select tests.login_as('s1');
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), tests.id('p:p1')) $$, 'PT403', null, 'a student cannot unlink their parent');
select tests.login_as('p1');
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:s3'), tests.id('p:p1')) $$, 'PT403', null, 'nor can a parent unlink themselves');
select tests.login_as('outsider');
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), tests.id('p:p1')) $$, 'PT403', null, 'nor an unknown Google account');
select tests.login_anon();
select throws_ok($$ select public.remove_parent_from_student(tests.id('s:s1'), tests.id('p:p1')) $$, '42501', null, 'nor anon');
select tests.logout();
select * from finish();
rollback;
