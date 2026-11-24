-- Enrolment, part 3: the administrator (settings, list, assigning, rejecting), and students a teacher adds to the pool.
begin;
select plan(49);

select tests.seed_basic();
select tests.mkoutsider('o2');
select tests.mkoutsider('o3');
select tests.mkoutsider('o4');
select tests.mkoutsider('o5');
insert into public.teacher_cv (teacher_id, about) values (tests.id('p:tc'), 'About Gama');

-- o2: a student for mathematics, o3: a parent for physics (profile not filled in yet), o4: a parent for mathematics, o5: a student
select tests.login_as('o2');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.login_as('o3');
select public.start_enrolment(tests.id('subj:phys'), 'parent');
select tests.login_as('o4');
select public.start_enrolment(tests.id('subj:math'), 'parent');
select tests.login_as('o5');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.logout();
select tests.reg('req:' || split_part(p.email, '@', 1), r.id)
  from public.enrolment_requests r join public.profiles p on p.id = r.applicant_id where p.email in ('o2@t.test', 'o3@t.test', 'o4@t.test', 'o5@t.test');
select tests.login_as('o2');
select public.complete_enrolment_profile(tests.id('req:o2'), 'Ena', 'Enic', '+381642000002', 'Skola', '5', null, null, true);
select tests.login_as('o4');
select public.complete_enrolment_profile(tests.id('req:o4'), 'Dado', 'Dadic', '+381642000004', 'Skola', '6', null, null, true);
select tests.login_as('o5');
select public.complete_enrolment_profile(tests.id('req:o5'), 'Eli', 'Elic', '+381642000005', 'Skola', '7', null, null, true);
select tests.logout();

-- settings and the list ---------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select is(
  (select row(s ->> 'form_enabled', s ->> 'daily_cap')::text from (select public.get_enrolment_settings() as s) x),
  row('true', '20')::text, 'the settings start as the owner decided: on, 20 a day'
);
select throws_ok($$ select public.set_enrolment_settings(true, 0) $$, 'PT400', null, 'a cap of 0 is refused');
select throws_ok($$ select public.set_enrolment_settings(true, 1001) $$, 'PT400', null, 'so is one beyond 1000');
select throws_ok($$ select public.set_enrolment_settings(null, 10) $$, 'PT400', null, 'and no on/off');
select is(
  (select array_agg(state order by applicant_email) from public.admin_list_enrolments() where applicant_email in ('o2@t.test', 'o3@t.test')),
  array['open', 'incomplete'], 'the list tells which request is waiting and which has no profile yet'
);
select is((select count(*)::int from public.admin_list_enrolments('incomplete') where applicant_email = 'o3@t.test'), 1, 'and can be filtered by state');
select tests.login_as('ta');
select throws_ok($$ select * from public.admin_list_enrolments() $$, 'PT403', null, 'a teacher does not use the administrator''s list');
select throws_ok(format($$ select public.admin_assign_enrolment(%L, %L) $$, tests.id('req:o2'), tests.id('p:ta')), 'PT403', null, 'nor assign');
select throws_ok(format($$ select public.approve_enrolment(%L) $$, tests.id('req:o2')), 'PT403', null, 'nor approve');
select throws_ok(format($$ select public.reject_enrolment(%L) $$, tests.id('req:o2')), 'PT403', null, 'nor reject');
select tests.login_as('s1');
select throws_ok($$ select public.get_enrolment_settings() $$, 'PT403', null, 'a student reads no settings');
select tests.login_anon();
select throws_ok($$ select public.admin_list_enrolments() $$, '42501', null, 'a visitor calls none of it');
select tests.logout();

-- assigning -----------------------------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select throws_ok(format($$ select public.admin_assign_enrolment(%L, %L) $$, tests.id('req:o3'), tests.id('p:tb')), 'PT409', null, 'a request without a profile cannot be assigned');
select tests.logout();
update public.teachers set is_active = false where profile_id = tests.id('p:tc');
select tests.login_as('admin');
select throws_ok(format($$ select public.admin_assign_enrolment(%L, %L) $$, tests.id('req:o2'), tests.id('p:tc')), 'PT400', null, 'a teacher who is not active cannot be assigned');
select tests.logout();
update public.teachers set is_active = true where profile_id = tests.id('p:tc');
select tests.login_as('admin');
select is(public.admin_assign_enrolment(tests.id('req:o2'), tests.id('p:tb')), 'assigned',
  'the administrator assigns a physics teacher to a mathematics request, without a warning');
select throws_ok(format($$ select public.admin_assign_enrolment(%L, %L) $$, tests.id('req:o2'), tests.id('p:ta')), 'PT404', null, 'a request that is done cannot be assigned again');
select tests.logout();
select is(
  (select row(s.teacher_id = tests.id('p:tb'), p.first_name, p.last_name)::text
     from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'o2@t.test'),
  row(true, 'Ena', 'Enic')::text, 'the student exists, with the typed name'
);
select is(
  (select array_agg(split_part(p.email, '@', 1) order by p.email) from public.notifications n join public.profiles p on p.id = n.recipient_id
    where n.kind = 'enrolment_assigned'),
  array['o2', 'tb'], 'the student and the teacher are told'
);

-- a parent's request: without the child's email the teacher gets to give it; with it, the child exists at once
select tests.login_as('o3');
select public.complete_enrolment_profile(tests.id('req:o3'), 'Fana', 'Fanic', '+381642000003', 'Skola', '8', null, null, true);
select tests.login_as('admin');
select is(public.admin_assign_enrolment(tests.id('req:o3'), tests.id('p:tb')), 'chosen', 'assigning a parent''s request without the child''s email waits for the teacher');
select is(public.admin_assign_enrolment(tests.id('req:o3'), tests.id('p:boss')), 'chosen', 'it can be given to another teacher meanwhile');
select tests.login_as('tb');
select is((select count(*)::int from public.list_chosen_enrolments()), 0, 'the first teacher no longer has it');
select tests.login_as('boss');
select is((select array_agg(student_first_name) from public.list_chosen_enrolments()), array['Fana'], 'the second has it');
select lives_ok(format($$ select public.complete_chosen_enrolment(%L, 'kid3@t.test') $$, tests.id('req:o3')), 'and completes it');
select tests.login_as('admin');
select is(public.admin_assign_enrolment(tests.id('req:o4'), tests.id('p:ta'), 'kid4@t.test'), 'assigned', 'with the email the child is a student at once');
select tests.logout();
select is(
  (select row(s.teacher_id = tests.id('p:ta'), pa.profile_id is not null)::text
     from public.students s join public.profiles cp on cp.id = s.profile_id
     join public.parent_students ps on ps.student_id = s.id join public.parents pa on pa.profile_id = ps.parent_id
    where cp.email = 'kid4@t.test'),
  row(true, true)::text, 'linked to the parent'
);
select is((select phone from public.person_phones where profile_id = (select id from public.profiles where email = 'o4@t.test')), '+381642000004', 'and the parent''s number is kept');

-- rejecting ------------------------------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok(format($$ select public.reject_enrolment(%L) $$, tests.id('req:o5')), 'the administrator turns a sign-up down');
select throws_ok(format($$ select public.reject_enrolment(%L) $$, tests.id('req:o5')), 'PT404', null, 'once');
select throws_ok(format($$ select public.reject_enrolment(%L) $$, tests.id('req:o2')), 'PT404', null, 'and not one that is placed');
select tests.login_as('o5');
select is((select count(*)::int from public.my_enrolment_requests()), 0, 'the person no longer sees it');
select tests.login_as('ta');
select is((select count(*)::int from public.list_enrolment_pool() where student_first_name = 'Eli'), 0, 'and the teachers do not either');
select tests.logout();

-- students a teacher adds to the pool -------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok(
  $$ select public.add_unassigned_student('pool1@t.test', 'Gaga', 'Gagic', '+381 64 200 0006', tests.id('subj:math'), 'Skola', '4', 'Banovo brdo', 'Slab u cetvrtom') $$,
  'a teacher adds a student nobody teaches yet'
);
select throws_ok($$ select public.add_unassigned_student('pool1@t.test', 'Gaga', 'Gagic', '+381642000006', tests.id('subj:math'), 'Skola', '4') $$,
  'PT409', null, 'the same person again is refused');
select throws_ok($$ select public.add_unassigned_student('pool2@t.test', 'Hana', 'Hanic', 'abc', tests.id('subj:math'), 'Skola', '4') $$,
  'PT400', null, 'a phone number is required');
select throws_ok($$ select public.add_unassigned_student('pool2@t.test', 'Hana', 'Hanic', '+381642000007', null, 'Skola', '4') $$,
  'PT400', null, 'and a subject');
select tests.login_as('s1');
select throws_ok($$ select public.add_unassigned_student('pool2@t.test', 'Hana', 'Hanic', '+381642000007', tests.id('subj:math'), 'Skola', '4') $$,
  'PT403', null, 'a student cannot add one');
select tests.logout();
select is(
  (select row(s.teacher_id is null, r.source, r.listed_at is not null, r.added_by = tests.id('p:ta'), r.profile_completed_at is not null)::text
     from public.enrolment_requests r join public.students s on s.id = r.student_id join public.profiles p on p.id = s.profile_id
    where p.email = 'pool1@t.test'),
  row(true, 'teacher', true, true, true)::text, 'the student has no teacher, is in the pool at once and is marked as added by a teacher'
);
select is((select phone from public.person_phones where profile_id = (select id from public.profiles where email = 'pool1@t.test')), '+381642000006', 'the number is kept');
select tests.login_as('tc');
select is((select array_agg(student_first_name) from public.list_enrolment_pool() where student_first_name = 'Gaga'), array['Gaga'], 'the mathematics teachers see it');
select tests.login_as('tb');
select is((select count(*)::int from public.list_enrolment_pool() where student_first_name = 'Gaga'), 0, 'a physics teacher does not');
select tests.logout();
select tests.reg('req:pool1', r.id) from public.enrolment_requests r join public.students s on s.id = r.student_id join public.profiles p on p.id = s.profile_id where p.email = 'pool1@t.test';
select tests.login_as('tb');
select throws_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pool1')), 'PT404', null, 'nor can offer for it');
select tests.logout();

select tests.login_as('admin');
select throws_ok(format($$ select public.reject_enrolment(%L) $$, tests.id('req:pool1')), 'PT404', null, 'a request of a student who has a record cannot be rejected');
select tests.logout();

-- the student and their parents are told about offers
select tests.mkparent('pk', 'Test', 'RoditeljK', array[]::text[]);
insert into public.parent_students (parent_id, student_id)
select tests.id('p:pk'), student_id from public.enrolment_requests where id = tests.id('req:pool1');
select tests.login_as('tc');
select lives_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pool1')), 'a mathematics teacher offers');
select tests.logout();
select is(
  (select array_agg(split_part(p.email, '@', 1) order by p.email) from public.notifications n join public.profiles p on p.id = n.recipient_id
    where n.kind = 'enrolment_offer' and n.payload ->> 'request_id' = tests.id('req:pool1')::text),
  array['pk', 'pool1'], 'the student and their parent are both told'
);
select tests.login_as('pk');
select is((select count(*)::int from public.my_enrolment_offers(tests.id('req:pool1'))), 1, 'and the parent sees the offers');
select is((select count(*)::int from public.my_enrolment_requests()), 1, 'and the request');
select tests.logout();

select tests.login_as('pk');
select is(public.choose_enrolment_teacher(tests.id('req:pool1'), tests.id('p:tc')), 'assigned', 'a parent chooses for the student a teacher added');
select tests.logout();
select is(
  (select s.teacher_id = tests.id('p:tc') from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'pool1@t.test'),
  true, 'and the existing student record gets the teacher (no second record)'
);
select is((select count(*)::int from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'pool1@t.test'), 1, 'one record only');

select * from finish();
rollback;
