-- Enrolment, part 4: students nobody teaches. The request is made by the database, the subject comes from the last lesson,
-- teachers see the student by subject, and a student and the parents always read their own teacher's CV.
begin;
select plan(44);

select tests.seed_basic();
insert into public.subjects (name) values ('Test Hemija');
insert into public.teacher_cv (teacher_id, about) values (tests.id('p:tc'), 'About Gama');
-- ta hides her CV from everybody; the student of ta still reads it
update public.teacher_cv set show_public = false, show_members = false where id = tests.id('cv:ta');

-- the CV of the student's own teacher -----------------------------------------------------------------------------------------------------
create function tests.member_cvs() returns text[] language sql as $$
  select coalesce(array_agg(slug order by slug), '{}') from public.list_member_cvs() where slug in ('test-alfa', 'test-beta')
$$;
select tests.login_as('s1');
select is(tests.member_cvs(), array['test-alfa', 'test-beta'], 'a student reads their teacher''s CV although it is switched off, and the CVs shared with members');
select isnt(public.get_member_cv('test-alfa'), null, 'and opens it');
select tests.login_as('s3');
select is(tests.member_cvs(), array['test-beta'], 'a student of another teacher does not read it');
select is(public.get_member_cv('test-alfa'), null, 'nor opens it');
select tests.login_as('p1');
select is(tests.member_cvs(), array['test-alfa', 'test-beta'], 'a parent reads the CV of the teacher of any of their children');
select tests.login_as('pu');
select is(tests.member_cvs(), array['test-beta'], 'a parent of a student nobody teaches only the shared ones');
select tests.login_as('tb');
select is(tests.member_cvs(), array['test-beta'], 'a colleague does not read it either');
select tests.login_anon();
select is(public.get_public_cv('test-alfa'), null, 'and the public does not: that switch is a different one');
select tests.login_as('s1');
select is(public.get_public_cv('test-alfa'), null, 'nor does a student of hers open it as a public CV');
select is((select count(*)::int from public.list_public_cvs() where slug in ('test-alfa', 'test-beta')), 0, 'nor is it in the list of public CVs for her');
select tests.logout();

-- unassigned students have a request -------------------------------------------------------------------------------------------------------
select is(
  (select row(source, subject_id is null, listed_at is not null, status::text)::text from public.enrolment_requests where student_id = tests.id('s:su')),
  row('legacy', true, true, 'open')::text, 'a student nobody teaches has a request without a subject, listed at once'
);
select is((select count(*)::int from public.enrolment_requests where student_id = tests.id('s:s1')), 0, 'a student who has a teacher has none');
select tests.login_as('admin');
select lives_ok($$ select public.add_student('late@t.test', 'Late', 'Kid', 'Skola', '4', null, null, null) $$, 'the administrator adds a student without a teacher');
select tests.logout();
select is(
  (select row(r.source, r.status::text)::text from public.enrolment_requests r join public.students s on s.id = r.student_id join public.profiles p on p.id = s.profile_id where p.email = 'late@t.test'),
  row('legacy', 'open')::text, 'that student has a request too'
);

-- a teacher leaves ----------------------------------------------------------------------------------------------------------------------------
insert into public.person_phones (profile_id, phone) values (tests.id('p:s1'), '+381641234567');
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:ta'));
select tests.logout();
select tests.reg('req:s1', id) from public.enrolment_requests where student_id = tests.id('s:s1');
select tests.reg('req:s2', id) from public.enrolment_requests where student_id = tests.id('s:s2');
select is(
  (select array_agg(row(r.source, sub.name)::text order by s.key) from public.enrolment_requests r
     join (select id, tests.key_of(id) as key from public.students where id in (tests.id('s:s1'), tests.id('s:s2'))) s on s.id = r.student_id
     left join public.subjects sub on sub.id = r.subject_id),
  array['(legacy,"Test Matematika")', '(legacy,)'],
  'the students she leaves get a request each: the subject of the last lesson, or none when there was no lesson'
);

select is(
  (select array_agg(row(contact_phone, profile_completed_at is not null)::text order by tests.key_of(student_id))
     from public.enrolment_requests where student_id in (tests.id('s:s1'), tests.id('s:s2'))),
  array['(+381641234567,t)', '(,f)'],
  'the request keeps the number the student had, and counts as complete only when school, grade and number are all known'
);

select tests.login_as('tc');
select is(tests.student_keys(), array['s1', 's2', 'su'], 'a mathematics teacher sees the one of mathematics and those without a subject');
select is((select count(*)::int from public.profiles where id = tests.id('p:s1')), 1, 'and the student''s profile');
select tests.login_as('tb');
select is(tests.student_keys(), array['s2', 's3', 'su'], 'a physics teacher sees the student of mathematics not at all, apart from their own');
select is((select count(*)::int from public.profiles where id = tests.id('p:s1')), 0, 'nor the profile');
select tests.login_as('boss');
select is(tests.student_keys(), array['s1', 's2', 's3', 'sb', 'su'], 'a teacher who is also an administrator sees everybody');
select tests.logout();

create function tests.pool_emails() returns text[] language sql as $$
  select coalesce(array_agg(applicant_email order by applicant_email), '{}') from public.list_enrolment_pool() where applicant_email like 's_@t.test'
$$;
select tests.login_as('tc');
select is(tests.pool_emails(), array['s1@t.test', 's2@t.test', 'su@t.test'], 'the pool of a mathematics teacher holds the three');
select tests.login_as('tb');
select is(tests.pool_emails(), array['s2@t.test', 'su@t.test'], 'the pool of a physics teacher only the ones without a subject');
select tests.logout();

-- the student, and a parent, see the request and choose its subject ---------------------------------------------------------------------
select tests.login_as('s1');
select is(
  (select row(source, status::text, subject_name, listed)::text from public.my_enrolment_requests()),
  row('legacy', 'open', 'Test Matematika', true)::text, 'the student sees their request'
);
select tests.login_as('p1');
select is((select count(*)::int from public.my_enrolment_requests()), 1, 'a parent sees the request of the child without a teacher (the other child has one)');
select tests.login_as('p2');
select is((select count(*)::int from public.my_enrolment_requests()), 1, 'and the parent of the other one theirs');
select tests.login_as('s1');
select throws_ok(format($$ select public.set_enrolment_subject(%L, %L) $$, tests.id('req:s2'), tests.id('subj:phys')), 'PT404', null, 'nobody changes the subject of somebody else''s request');
select tests.login_as('p2');
select throws_ok(format($$ select public.set_enrolment_subject(%L, null) $$, tests.id('req:s2')), 'PT400', null, 'a subject is needed');
select throws_ok(format($$ select public.set_enrolment_subject(%L, (select id from public.subjects where name = 'Test Hemija')) $$, tests.id('req:s2')), 'PT400', null, 'a subject somebody teaches');
select tests.logout();

-- offers made before the subject was known stay only with teachers of that subject
select tests.login_as('tb');
select public.offer_enrolment(tests.id('req:s2'));
select tests.login_as('tc');
select public.offer_enrolment(tests.id('req:s2'));
select tests.logout();
select is((select count(*)::int from public.enrolment_offers where request_id = tests.id('req:s2')), 2, 'two teachers offered while there was no subject');
select tests.login_as('p2');
select lives_ok(format($$ select public.set_enrolment_subject(%L, %L) $$, tests.id('req:s2'), tests.id('subj:phys')), 'the parent picks physics');
select tests.logout();
select is(
  (select array_agg(tests.key_of(teacher_id)) from public.enrolment_offers where request_id = tests.id('req:s2')),
  array['p:tb'], 'the offer of the mathematics teacher goes'
);
select tests.login_as('tc');
select is(tests.student_keys(), array['s1', 'su'], 'and the mathematics teachers no longer see that student');
select tests.login_as('tb');
select is(tests.student_keys(), array['s2', 's3', 'su'], 'the physics teachers do');
select tests.logout();
update public.enrolment_requests set source = 'signup' where id = tests.id('req:s2');
select tests.login_as('p2');
select throws_ok(format($$ select public.set_enrolment_subject(%L, %L) $$, tests.id('req:s2'), tests.id('subj:math')), 'PT409', null, 'a sign-up keeps the subject it was made for');
select tests.logout();
update public.enrolment_requests set source = 'legacy' where id = tests.id('req:s2');

-- placed again, and left again ----------------------------------------------------------------------------------------------------------------------
update public.enrolment_requests set restarts = 2, choice_opened_at = now() - interval '1 day', listed_at = now() - interval '10 days' where id = tests.id('req:s1');
select tests.login_as('admin');
select is(public.admin_assign_enrolment(tests.id('req:s1'), tests.id('p:tc')), 'assigned', 'the administrator places a teacher');
select tests.logout();
select is((select status::text from public.enrolment_requests where id = tests.id('req:s1')), 'assigned', 'the request is closed');
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:tc'));
select tests.logout();
select is(
  (select row(status::text, restarts, choice_opened_at is null, chosen_teacher_id is null, assigned_at is null, listed_at > now() - interval '1 minute')::text
     from public.enrolment_requests where id = tests.id('req:s1')),
  row('open', 0, true, true, true, true)::text, 'the teacher leaves: the same request is open again and waiting from now'
);

-- whatever places a teacher closes the request -------------------------------------------------------------------------------------------------------------
select tests.reg('req:su', id) from public.enrolment_requests where student_id = tests.id('s:su');
select tests.login_as('tb');
select public.offer_enrolment(tests.id('req:su'));
select tests.logout();
update public.students set teacher_id = tests.id('p:boss') where id = tests.id('s:su');
select is(
  (select row(status::text, chosen_teacher_id = tests.id('p:boss'))::text from public.enrolment_requests where student_id = tests.id('s:su')),
  row('assigned', true)::text, 'a teacher placed by any route marks the request assigned'
);
select is((select count(*)::int from public.enrolment_offers where request_id = tests.id('req:su')), 0, 'and the offer of the other teacher is closed');

-- deleting the student takes the request with it ------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok(
  $$ select public.delete_student((select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'late@t.test')) $$,
  'the administrator deletes the student they added'
);
select tests.logout();
select is((select count(*)::int from public.enrolment_requests r join public.profiles p on p.id = r.applicant_id where p.email = 'late@t.test'), 0, 'the request goes with them');

-- a student who is left again keeps the subject they had; the subject follows the newest lesson ----------------------------------------------------
select tests.login_as('admin');
select public.admin_assign_enrolment(tests.id('req:s2'), tests.id('p:tb'));
select public.deactivate_teacher(tests.id('p:tb'));
select tests.logout();
select is(
  (select sub.name from public.enrolment_requests r join public.subjects sub on sub.id = r.subject_id where r.id = tests.id('req:s2')),
  'Test Fizika', 'the request that came back open keeps its subject although there was no lesson to take it from'
);
select tests.mklesson('b_old', 'boss', 'phys', 'L1', 'R1', tests.at(-96 * 60), 60, 'confirmed', 'teacher', array['sb']);
select tests.mklesson('b_new', 'boss', 'math', 'L1', 'R1', tests.at(-48 * 60), 60, 'confirmed', 'teacher', array['sb']);
select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:boss'));
select tests.logout();
select is(
  (select sub.name from public.enrolment_requests r join public.subjects sub on sub.id = r.subject_id where r.student_id = tests.id('s:sb')),
  'Test Matematika', 'the subject of a student who is left is that of the newest lesson, not of an older one'
);

select * from finish();
rollback;
