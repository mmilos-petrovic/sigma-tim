-- Who can see and change people: profiles, teachers, students, parents and their links.
begin;
select plan(50);

select tests.seed_basic();

-- profiles ------------------------------------------------------------------------------------
select tests.login_as('admin');
select is(tests.profile_keys(), array['admin','boss','p1','p2','pu','s1','s2','s3','sb','su','ta','tb','tc'],
  'admin sees every profile');

select tests.login_as('ta');
select is(tests.profile_keys(), array['boss','p1','p2','pu','s1','s2','su','ta','tb','tc'],
  'a teacher sees colleagues, own and unassigned students and their parents, but not other teachers'' students');

select tests.login_as('tc');
select is(tests.profile_keys(), array['boss','pu','su','ta','tb','tc'],
  'a teacher without students sees colleagues plus the unassigned student and parent');

select tests.login_as('s1');
select is(tests.profile_keys(), array['s1','ta'], 'a student sees themselves and their teacher only');

select tests.login_as('p1');
select is(tests.profile_keys(), array['p1','s1','s3','ta','tb'],
  'a parent sees themselves, their children and the children''s teachers');

select tests.login_as('pu');
select is(tests.profile_keys(), array['pu','su'], 'the parent of an unassigned student sees only themselves and the child');

select tests.login_as('boss');
select is(tests.profile_keys(), array['admin','boss','p1','p2','pu','s1','s2','s3','sb','su','ta','tb','tc'],
  'an admin who is also a teacher still sees every profile');

-- profile writes --------------------------------------------------------------------------------
select tests.login_as('ta');
select is(tests.affected($$ update public.profiles set first_name = 'Renamed' where id = tests.id('p:ta') $$), 1,
  'a user can edit their own name');
select is(tests.affected($$ update public.profiles set first_name = 'Hacked' where id = tests.id('p:tb') $$), 0,
  'a user cannot edit someone else''s name');
select is(tests.affected($$ update public.profiles set first_name = 'Hacked' where id = tests.id('p:s1') $$), 0,
  'a teacher cannot edit a student''s profile through the table');
select throws_ok($$ update public.profiles set email = 'new@t.test' where id = tests.id('p:ta') $$, '42501', null,
  'emails cannot be changed through the table');
select throws_ok($$ update public.profiles set user_id = null where id = tests.id('p:ta') $$, '42501', null,
  'the account link cannot be changed through the table');
select throws_ok($$ delete from public.profiles where id = tests.id('p:ta') $$, '42501', null,
  'profiles cannot be deleted through the table');

-- teachers --------------------------------------------------------------------------------------
select tests.login_as('tc');
select is((select count(*)::int from public.teachers where profile_id = any(tests.ids('p:'))), 4,
  'a teacher sees all four teacher rows');

select tests.login_as('s1');
select is((select array_agg(profile_id) from public.teachers where profile_id = any(tests.ids('p:'))),
  array[tests.id('p:ta')], 'a student sees only their own teacher');
select is((select count(*)::int from public.teacher_subjects where teacher_id = any(tests.ids('p:'))), 1,
  'a student sees only their teacher''s subjects');

select tests.login_as('p1');
select is((select count(*)::int from public.teachers where profile_id = any(tests.ids('p:'))), 2,
  'a parent sees the teachers of all their children');

select tests.login_as('pu');
select is((select count(*)::int from public.teachers where profile_id = any(tests.ids('p:'))), 0,
  'the parent of an unassigned student sees no teacher');

select tests.login_as('ta');
select is(tests.affected($$ update public.teachers set bio = 'My bio' where profile_id = tests.id('p:ta') $$), 1,
  'a teacher can edit their own bio');
select is(tests.affected($$ update public.teachers set bio = 'Hacked' where profile_id = tests.id('p:tb') $$), 0,
  'a teacher cannot edit a colleague''s bio');
select throws_ok($$ update public.teachers set is_active = false where profile_id = tests.id('p:ta') $$, '42501', null,
  'a teacher cannot deactivate themselves through the table');
select throws_ok($$ insert into public.teachers (profile_id) values (tests.id('p:s1')) $$, '42501', null,
  'a teacher cannot promote someone to teacher');

select tests.login_as('admin');
select throws_ok($$ update public.teachers set is_active = false where profile_id = tests.id('p:ta') $$, '42501', null,
  'even admin deactivates teachers only through deactivate_teacher()');

-- students --------------------------------------------------------------------------------------
select tests.login_as('admin');
select is(tests.student_keys(), array['s1','s2','s3','sb','su'], 'admin sees every student');

select tests.login_as('ta');
select is(tests.student_keys(), array['s1','s2','su'], 'a teacher sees own students and the unassigned ones');

select tests.login_as('tb');
select is(tests.student_keys(), array['s3','su'], 'another teacher sees only their own plus the unassigned ones');

select tests.login_as('tc');
select is(tests.student_keys(), array['su'], 'a teacher without students still sees the unassigned student');

select tests.login_as('boss');
select is(tests.student_keys(), array['s1','s2','s3','sb','su'], 'an admin who is also a teacher still sees every student');

select tests.login_as('s1');
select is(tests.student_keys(), array['s1'], 'a student sees only themselves');

select tests.login_as('p1');
select is(tests.student_keys(), array['s1','s3'], 'a parent sees their children across teachers');

select tests.login_as('p2');
select is(tests.student_keys(), array['s2'], 'a parent sees only their own child');

select tests.login_as('outsider');
select is(tests.student_keys(), '{}'::text[], 'an unknown Google account sees no students');

select tests.login_as('ta');
select is(tests.affected($$ update public.students set school = 'New School' where id = tests.id('s:s1') $$), 1,
  'a teacher can edit their own student');
select is(tests.affected($$ update public.students set school = 'Hacked' where id = tests.id('s:s3') $$), 0,
  'a teacher cannot edit another teacher''s student');
select is(tests.affected($$ update public.students set school = 'Hacked' where id = tests.id('s:su') $$), 0,
  'a teacher can read but not edit an unassigned student');
select throws_ok($$ update public.students set teacher_id = tests.id('p:ta') where id = tests.id('s:su') $$, '42501', null,
  'students cannot be reassigned through the table (only via takeover requests)');
select throws_ok($$ update public.students set teacher_id = null where id = tests.id('s:s1') $$, '42501', null,
  'students cannot be released through the table either');
select throws_ok($$ delete from public.students where id = tests.id('s:s1') $$, '42501', null,
  'students cannot be deleted through the table');

select tests.login_as('s1');
select is(tests.affected($$ update public.students set school = 'Mine' where id = tests.id('s:s1') $$), 0,
  'a student cannot edit their own record (the teacher owns it)');

-- parents and links -----------------------------------------------------------------------------
select tests.login_as('ta');
select is((select count(*)::int from public.parents where profile_id = any(tests.ids('p:'))), 3,
  'a teacher sees the parents of their own and of unassigned students');
select is((select count(*)::int from public.parent_students where student_id = any(tests.ids('s:'))), 3,
  'a teacher sees links to own and unassigned students only (not p1 -> s3)');

select tests.login_as('p1');
select is((select count(*)::int from public.parents where profile_id = any(tests.ids('p:'))), 1, 'a parent sees only themselves in parents');
select is((select count(*)::int from public.parent_students where student_id = any(tests.ids('s:'))), 2, 'a parent sees their own links');

select tests.login_as('s1');
select is((select count(*)::int from public.parents where profile_id = any(tests.ids('p:'))), 0, 'a student does not see their parents');
select is((select count(*)::int from public.parent_students where student_id = any(tests.ids('s:'))), 0, 'a student does not see parent links');

select tests.login_as('ta');
select throws_ok($$ insert into public.parent_students (parent_id, student_id) values (tests.id('p:p2'), tests.id('s:s1')) $$,
  '42501', null, 'links are created through add_parent_to_student() only');
select throws_ok($$ delete from public.parent_students where student_id = tests.id('s:s1') $$,
  '42501', null, 'links cannot be deleted through the table');

-- anon ------------------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$ select count(*) from public.students $$, '42501', null, 'anon cannot read students');
select throws_ok($$ select count(*) from public.teachers $$, '42501', null, 'anon cannot read teachers');
select throws_ok($$ select count(*) from public.parents $$, '42501', null, 'anon cannot read parents');

select tests.logout();
select * from finish();
rollback;
