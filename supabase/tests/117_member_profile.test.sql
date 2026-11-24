begin;
-- The profile of a student and a parent: confirmed once before anything else, changed afterwards, and reused when a student (or a
-- parent, for a child) asks for lessons in another subject.
select plan(63);

select tests.seed_basic();
select tests.mkoutsider('o1');
select tests.mkoutsider('o2');

-- nobody has confirmed yet ---------------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select is((select profile_confirmed from public.my_roles()), false, 'a student a teacher added has not confirmed the profile');
select tests.login_as('p1');
select is((select profile_confirmed from public.my_roles()), false, 'nor has a parent');
select tests.login_as('ta');
select throws_ok($$ select public.my_profile() $$, 'PT403', null, 'a teacher has no such profile');
select throws_ok($$ select public.save_my_profile('+381641234567', '[]', true) $$, 'PT403', null, 'and cannot save one');
select tests.login_as('o1');
select throws_ok($$ select public.my_profile() $$, 'PT403', null, 'nor has a Google account the school does not know');

-- reading ---------------------------------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select is((select public.my_profile() ->> 'confirmed'), 'false', 'the profile says it is not confirmed');
select is((select jsonb_array_length(public.my_profile() -> 'people')), 1, 'a student sees themselves');
select is(
  (select (public.my_profile() -> 'people' -> 0) ->> 'self'), 'true', 'as themselves'
);
select is(
  (select row(p ->> 'first_name', p ->> 'last_name', p ->> 'school', p ->> 'grade', p ->> 'phone')::text
     from jsonb_array_elements(public.my_profile() -> 'people') p),
  row('Test', 'Prvi', 'Test School', '5', null)::text, 'with what the teacher entered'
);
select tests.login_as('p1');
select is((select jsonb_array_length(public.my_profile() -> 'people')), 2, 'a parent sees each child');
select is((select public.my_profile() ->> 'is_parent'), 'true', 'and that they are a parent');
select is(
  (select array_agg(p ->> 'self') from jsonb_array_elements(public.my_profile() -> 'people') p), array['false', 'false'],
  'none of them is the parent'
);

-- saving: what is refused -------------------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, false) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'))),
  'PT400', null, 'the first save needs the privacy policy'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', ' ', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'))),
  'PT400', null, 'a name is needed'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', '', 'grade', '6'))),
  'PT400', null, 'and a school'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', ' '))),
  'PT400', null, 'and a grade'
);
select throws_ok(
  format($$ select public.save_my_profile('0641234567', %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'))),
  'PT400', null, 'a number without the country is refused'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6',
    'situation', repeat('x', 1001)))),
  'PT400', null, 'a text that is too long'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s2'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'))),
  'PT403', null, 'nobody else''s profile'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, true) $$, jsonb_build_array(
    jsonb_build_object('profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'),
    jsonb_build_object('profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'))),
  'PT400', null, 'a person once'
);
select throws_ok($$ select public.save_my_profile(null, '{}', true) $$, 'PT400', null, 'a list of people is needed');
select throws_ok($$ select public.save_my_profile(null, '[]', true) $$, 'PT400', null, 'and everybody in it');
select tests.login_as('p1');
select throws_ok(
  format($$ select public.save_my_profile('+381641234567', %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'))),
  'PT400', null, 'a parent has to give every child'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, true) $$, jsonb_build_array(
    jsonb_build_object('profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'),
    jsonb_build_object('profile_id', tests.id('p:s3'), 'first_name', 'Mika', 'last_name', 'Mikic', 'school', 'Skola', 'grade', '7'))),
  'PT400', null, 'and needs a phone number'
);
select tests.login_as('p2');
select throws_ok(
  format($$ select public.save_my_profile('+381641234567', %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola', 'grade', '6'))),
  'PT403', null, 'a parent cannot save the child of another parent'
);
select tests.logout();
select is(
  (select row(first_name, last_name, profile_confirmed_at is null)::text from public.profiles where id = tests.id('p:s1')),
  row('Test', 'Prvi', true)::text, 'nothing was saved by the refused calls'
);

-- a student confirms --------------------------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select lives_ok(
  format($$ select public.save_my_profile('+381641111222', %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola 1', 'grade', '6',
    'city_part', 'Zemun', 'situation', 'Treba pomoc'))),
  'a student confirms the profile with their own number'
);
select is((select profile_confirmed from public.my_roles()), true, 'and it is confirmed');
select is(
  (select row(p ->> 'first_name', p ->> 'last_name', p ->> 'school', p ->> 'grade', p ->> 'phone', p ->> 'city_part', p ->> 'situation')::text
     from jsonb_array_elements(public.my_profile() -> 'people') p),
  row('Pera', 'Peric', 'Skola 1', '6', '+381641111222', 'Zemun', 'Treba pomoc')::text, 'with all of it'
);
select is((select public.my_profile() ->> 'phone'), '+381641111222', 'the number is the student''s own');
select lives_ok(
  format($$ select public.save_my_profile('+381641111222', %L::jsonb, false) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola 2', 'grade', '7'))),
  'later it is changed without the policy again'
);
select is(
  (select row(p ->> 'school', p ->> 'city_part', p ->> 'situation')::text from jsonb_array_elements(public.my_profile() -> 'people') p),
  row('Skola 2', null, null)::text, 'the optional texts can be left out'
);
select lives_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, false) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola 2', 'grade', '7'))),
  'a student may take their number away'
);
select is((select public.my_profile() ->> 'phone'), null, 'it is gone');
select tests.logout();
select is(
  (select array_agg(school order by teacher_id is null) from public.students where profile_id = tests.id('p:s1')),
  array['Skola 2'], 'the school is in the record of the student'
);
select is((select count(*)::int from public.profiles where id = tests.id('p:s1') and profile_confirmed_at is not null), 1, 'and the moment is kept');

-- the tables of the details are not for reading --------------------------------------------------------------------------------------------
select tests.login_as('s1');
select throws_ok($$ select * from public.student_details $$, '42501', null, 'the free text is only reached through the functions');
select tests.logout();

-- a parent confirms for the children -------------------------------------------------------------------------------------------------------------
select tests.login_as('p1');
select lives_ok(
  format($$ select public.save_my_profile('+381642222333', %L::jsonb, true) $$, jsonb_build_array(
    jsonb_build_object('profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola 3', 'grade', '8',
                       'phone', '+381643333444'),
    jsonb_build_object('profile_id', tests.id('p:s3'), 'first_name', 'Mika', 'last_name', 'Mikic', 'school', 'Skola 4', 'grade', '2'))),
  'a parent confirms their own number and each child'
);
select is((select profile_confirmed from public.my_roles()), true, 'the parent is confirmed');
select is(
  (select array_agg(row(p ->> 'first_name', p ->> 'school', p ->> 'phone')::text order by p ->> 'first_name')
     from jsonb_array_elements(public.my_profile() -> 'people') p),
  array[row('Mika', 'Skola 4', null)::text, row('Pera', 'Skola 3', '+381643333444')::text], 'the children are as the parent wrote them'
);
select throws_ok(
  format($$ select public.save_my_profile(null, %L::jsonb, false) $$, jsonb_build_array(
    jsonb_build_object('profile_id', tests.id('p:s1'), 'first_name', 'Pera', 'last_name', 'Peric', 'school', 'Skola 3', 'grade', '8'),
    jsonb_build_object('profile_id', tests.id('p:s3'), 'first_name', 'Mika', 'last_name', 'Mikic', 'school', 'Skola 4', 'grade', '2'))),
  'PT400', null, 'a parent never loses their number'
);
select tests.logout();
select is(
  (select array_agg(profile_confirmed_at is not null order by email) from public.profiles where id in (tests.id('p:s1'), tests.id('p:s3'))),
  array[true, true], 'the children are confirmed as well'
);
select is((select phone from public.person_phones where profile_id = tests.id('p:s1')), '+381643333444', 'with the number of the child');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:s3')), 0, 'and none when the parent gave none');
select tests.login_as('s3');
select is((select profile_confirmed from public.my_roles()), true, 'the child who signs in later has nothing to confirm');

-- a student nobody teaches: the request waits for the profile ----------------------------------------------------------------------------------
select tests.logout();
select tests.reg('req:su', id) from public.enrolment_requests where student_id = tests.id('s:su');
select is((select profile_completed_at is null from public.enrolment_requests where id = tests.id('req:su')), true, 'the request of a student without a number is not complete');
select tests.login_as('su');
select lives_ok(
  format($$ select public.save_my_profile('+381644444555', %L::jsonb, true) $$, jsonb_build_array(jsonb_build_object(
    'profile_id', tests.id('p:su'), 'first_name', 'Nera', 'last_name', 'Neric', 'school', 'Skola 5', 'grade', '3'))),
  'the student confirms the profile'
);
select tests.logout();
select is(
  (select row(student_first_name, school, grade, contact_phone, profile_completed_at is not null, listed_at is not null)::text
     from public.enrolment_requests where id = tests.id('req:su')),
  row('Nera', 'Skola 5', '3', '+381644444555', true, true)::text, 'and the request has it, so the teachers see it'
);

-- a student asks for another subject -----------------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select tests.logout();
select tests.login_as('s1');
select lives_ok($$ select public.start_enrolment(tests.id('subj:phys'), 'student') $$, 'a student who has a teacher asks for another subject');
select tests.logout();
select tests.reg('req:s1phys', id) from public.enrolment_requests where applicant_id = tests.id('p:s1') and subject_id = tests.id('subj:phys');
select is(
  (select row(student_first_name, school, grade, contact_phone, profile_completed_at is not null, consent_at is not null, listed_at is not null)::text
     from public.enrolment_requests where id = tests.id('req:s1phys')),
  row('Pera', 'Skola 3', '8', '+381643333444', true, true, true)::text, 'it has the profile already: only the subject was asked'
);
select tests.login_as('s1');
select is(public.start_enrolment(tests.id('subj:phys'), 'student'), tests.id('req:s1phys'), 'asking again for it gives the same request');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'and for a second subject another request');
select is((select count(*)::int from public.my_enrolment_requests()), 2, 'a student has two requests, one for each subject');
select tests.logout();
select tests.reg('req:s1math', id) from public.enrolment_requests where applicant_id = tests.id('p:s1') and subject_id = tests.id('subj:math');
select tests.login_as('s1');
select throws_ok(
  format($$ select public.set_enrolment_subject(%L, %L) $$, tests.id('req:s1math'), tests.id('subj:phys')),
  'PT409', null, 'the subject of one cannot become the subject of the other'
);
select tests.logout();

-- a parent asks for another subject for a child --------------------------------------------------------------------------------------------------
select tests.login_as('p1');
select lives_ok(format($$ select public.start_enrolment(%L, 'parent', %L) $$, tests.id('subj:math'), tests.id('p:s3')), 'a parent asks for a subject for a child who is a student');
select throws_ok(format($$ select public.start_enrolment(%L, 'parent', %L) $$, tests.id('subj:phys'), tests.id('p:s2')), 'PT404', null, 'but not for the child of somebody else');
select throws_ok(format($$ select public.start_enrolment(%L, 'student', %L) $$, tests.id('subj:phys'), tests.id('p:s3')), 'PT400', null, 'and a student does not ask for a child');
select tests.logout();
select tests.reg('req:p1s3', id) from public.enrolment_requests where applicant_id = tests.id('p:p1') and child_profile_id = tests.id('p:s3');
select is(
  (select row(student_first_name, school, grade, contact_phone, profile_completed_at is not null)::text
     from public.enrolment_requests where id = tests.id('req:p1s3')),
  row('Mika', 'Skola 4', '2', '+381642222333', true)::text, 'the request has the child and the number of the parent'
);
select tests.login_as('admin');
select is(public.admin_assign_enrolment(tests.id('req:p1s3'), tests.id('p:tc')), 'assigned', 'a teacher is placed at once: the child is known');
select tests.logout();
select is(
  (select count(*)::int from public.students s join public.parent_students ps on ps.student_id = s.id
    where s.profile_id = tests.id('p:s3') and s.teacher_id = tests.id('p:tc') and ps.parent_id = tests.id('p:p1')),
  1, 'the child has a second record with the new teacher, and the parent has it'
);

-- a request through the form confirms the profile ---------------------------------------------------------------------------------------------------
select tests.login_as('o1');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.logout();
select tests.reg('req:o1', id) from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'o1@t.test');
select tests.login_as('o1');
select is((select profile_confirmed from public.my_roles()), false, 'a person who has started the form has not confirmed yet');
select lives_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Oma', 'Omic', '+381645555666', 'Skola 6', '4', null, null, true) $$, tests.id('req:o1')),
  'the profile of the request is completed with the policy'
);
select is((select profile_confirmed from public.my_roles()), true, 'and that confirms it');
select tests.logout();

select * from finish();
rollback;
