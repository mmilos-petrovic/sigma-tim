-- Enrolment, part 1: the landing-page form, signing up with Google, the profile, the daily cap and the administrator's approval.
begin;
select plan(51);

select tests.seed_basic();
-- a subject nobody teaches, and three more Google accounts without a profile
insert into public.subjects (name) values ('Test Hemija');
select tests.mkoutsider('o2');
select tests.mkoutsider('o3');
select tests.mkoutsider('o4');
update auth.users set raw_user_meta_data = '{"given_name":"Ana","family_name":"Anic","avatar_url":"http://x/a.png"}' where id = tests.id('u:o2');
update auth.users set raw_user_meta_data = '{"full_name":"Mika Mikic Treci"}' where id = tests.id('u:o3');

-- the form --------------------------------------------------------------------------------------------------------------------
select tests.login_anon();
select is(
  (select array_agg(x ->> 'name' order by ord)
     from jsonb_array_elements(public.enrolment_form_info() -> 'subjects') with ordinality as t(x, ord)
    where x ->> 'name' like 'Test %'),
  array['Test Matematika', 'Test Fizika'],
  'a visitor gets the subjects somebody teaches, the one with most teachers first, and not the ones nobody teaches'
);
select is((public.enrolment_form_info() ->> 'enabled')::boolean, true, 'and whether the form is on');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, '42501', null, 'a visitor who has not signed in cannot sign up');
select throws_ok($$ select * from public.enrolment_requests $$, '42501', null, 'nor read the requests');
select tests.logout();

-- signing up -------------------------------------------------------------------------------------------------------------------
select tests.login_as('outsider');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'a Google account the school does not know signs up as a student');
select is(
  (select count(*)::int from public.my_enrolment_requests() where applicant_role = 'student' and status = 'open'
      and not profile_completed and not listed),
  1, 'and has one open request, with no profile yet and not shown to teachers'
);
select is(
  (select row(is_admin or is_teacher or is_student or is_parent, email)::text from public.my_roles()),
  row(false, 'outsider@t.test')::text,
  'it now has a profile from the confirmed Google email, and no role: it is not a member'
);
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'asking again is fine');
select lives_ok($$ select public.start_enrolment(tests.id('subj:phys'), 'student') $$, 'also with another subject: it only changes the subject of the same request');
select is((select count(*)::int from public.my_enrolment_requests()), 1, 'still one request');
select throws_ok($$ select * from public.enrolment_requests $$, '42501', null, 'the applicant cannot read the table either');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'teacher') $$, 'PT400', null, 'the role is student or parent');
select throws_ok($$ select public.start_enrolment(null, 'student') $$, 'PT400', null, 'a subject is required');
select tests.logout();

select is(
  (select subject_id::text from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'outsider@t.test')),
  tests.id('subj:phys')::text, 'the subject follows the last choice until the profile is complete'
);
select is(
  (select (first_name, last_name)::text from public.profiles where email = 'outsider@t.test'),
  '(outsider,-)', 'without a name from Google the profile takes the email name and a dash'
);

select tests.reg('req:outsider', id) from public.enrolment_requests
 where applicant_id = (select id from public.profiles where email = 'outsider@t.test');

select tests.login_as('o2');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'parent') $$, 'another account signs up as a parent');
select tests.login_as('o3');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'and a third as a student');
select tests.logout();
select is(
  (select array_agg((first_name, last_name)::text order by email) from public.profiles where email in ('o2@t.test', 'o3@t.test')),
  array['(Ana,Anic)', '(Mika,"Mikic Treci")'],
  'names come from Google: given and family name, or the full name split at the first space'
);
select is((select avatar_url from public.profiles where email = 'o2@t.test'), 'http://x/a.png', 'and the picture');

-- who may not -------------------------------------------------------------------------------------------------------------------
select tests.login_as('tb');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'PT409', null, 'a teacher is already a member (a student may ask for another subject: see 117)');
select tests.login_as('ta');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'PT409', null, 'a teacher too');
select tests.login_as('admin');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'parent') $$, 'PT409', null, 'and the administrator');
select tests.login_as('p1');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'PT409', null, 'a parent cannot sign up as a student');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'parent') $$, 'but can send a request for another child');
select tests.logout();
select tests.login_as('o4');
select throws_ok($$ select public.start_enrolment((select id from public.subjects where name = 'Test Hemija'), 'student') $$, 'PT400', null, 'a subject nobody teaches is refused');
select tests.logout();

-- the profile --------------------------------------------------------------------------------------------------------------------
select tests.login_as('o2');
select throws_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Ana', 'Anic', '+381 64 4994235', 'Skola', '5', null, null, false) $$,
         tests.id('req:outsider')),
  'PT404', null, 'nobody can fill in somebody else''s request'
);
select tests.logout();
select tests.login_as('outsider');
select throws_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Pera', 'Peric', '+381 64 4994235', 'Skola', '5', null, null, false) $$,
         tests.id('req:outsider')),
  'PT400', null, 'the privacy policy has to be accepted'
);
select throws_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Pera', 'Peric', '064', 'Skola', '5', null, null, true) $$,
         tests.id('req:outsider')),
  'PT400', null, 'the phone number has to be a number'
);
select throws_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Pera', 'Peric', '+381644994235', '  ', '5', null, null, true) $$,
         tests.id('req:outsider')),
  'PT400', null, 'the school is required'
);
select throws_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Pera', 'Peric', '+381644994235', 'Skola', '', null, null, true) $$,
         tests.id('req:outsider')),
  'PT400', null, 'and the grade'
);
select throws_ok(
  format($$ select public.complete_enrolment_profile(%L, '', 'Peric', '+381644994235', 'Skola', '5', null, null, true) $$,
         tests.id('req:outsider')),
  'PT400', null, 'and the name'
);
select lives_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Pera', 'Peric', '+381 64 4994235', 'Skola', '5', 'Zvezdara', 'Slabo ide matematika', true) $$,
         tests.id('req:outsider')),
  'a complete profile is saved'
);
select tests.logout();
select is(
  (select row(student_first_name, student_last_name, contact_phone, school, grade, city_part, situation,
              consent_at is not null, profile_completed_at is not null, listed_at is not null)::text
     from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'outsider@t.test')),
  row('Pera', 'Peric', '+381644994235', 'Skola', '5', 'Zvezdara', 'Slabo ide matematika', true, true, true)::text,
  'the typed data is kept, the number in its international form, consent recorded and the teachers can see the request'
);
select tests.login_as('outsider');
select lives_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Pera', 'Peric', '+381644994235', 'Druga skola', '6', null, null, false) $$,
         tests.id('req:outsider')),
  'it can be changed while no teacher is chosen (the consent was given once)'
);
select tests.logout();
select is(
  (select row(school, grade, city_part)::text from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'outsider@t.test')),
  row('Druga skola', '6', null)::text, 'the new values replace the old ones'
);

-- accounts that are not a confirmed Google sign-in ---------------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (gen_random_uuid(), 'authenticated', 'authenticated', 'pw@t.test', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  (gen_random_uuid(), 'authenticated', 'authenticated', 'unconfirmed@t.test', null, '{"provider":"google","providers":["google"]}', '{}', now(), now());
select tests.reg('u:pw', id) from auth.users where email = 'pw@t.test';
select tests.reg('u:unconfirmed', id) from auth.users where email = 'unconfirmed@t.test';
select tests.login_as('pw');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'PT403', null, 'a password account cannot sign up: only Google');
select tests.login_as('unconfirmed');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'PT403', null, 'nor one whose email is not confirmed');
select tests.logout();

-- a sign-up from an earlier day does not count against today's cap
select tests.mkoutsider('o8');
select tests.login_as('o8');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.logout();
update public.enrolment_requests set created_at = now() - interval '2 days'
 where applicant_id = (select id from public.profiles where email = 'o8@t.test');

-- the daily cap ------------------------------------------------------------------------------------------------------------------
-- today there are 4 sign-ups (outsider, o2, o3 and the parent request p1)
select tests.login_as('admin');
select lives_ok($$ select public.set_enrolment_settings(true, 5) $$, 'the administrator sets the cap');
select tests.login_as('ta');
select throws_ok($$ select public.set_enrolment_settings(true, 5) $$, 'PT403', null, 'nobody else does');
select throws_ok($$ select public.get_enrolment_settings() $$, 'PT403', null, 'or reads them');
select tests.logout();
select tests.mkoutsider('o5');
select tests.mkoutsider('o6');
select tests.login_as('o5');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'the fifth sign-up of the day is within the cap of 5');
select tests.login_as('o6');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'the sixth is past it: still accepted, nobody is told "closed"');
select tests.logout();
select tests.reg('req:o6', id) from public.enrolment_requests
 where applicant_id = (select id from public.profiles where email = 'o6@t.test');
select is(
  (select array_agg(needs_approval order by email) from public.enrolment_requests r join public.profiles p on p.id = r.applicant_id
    where p.email in ('o5@t.test', 'o6@t.test')),
  array[false, true], 'but it waits for the administrator'
);
select tests.login_as('o6');
select lives_ok(
  format($$ select public.complete_enrolment_profile(%L, 'Sasa', 'Sasic', '+381641112223', 'Skola', '7', null, null, true) $$,
         tests.id('req:o6')),
  'it fills in its profile'
);
select tests.logout();
select is(
  (select listed_at is null and profile_completed_at is not null from public.enrolment_requests
    where applicant_id = (select id from public.profiles where email = 'o6@t.test')),
  true, 'and is still not shown to teachers'
);
select tests.login_as('admin');
select is(
  (select state from public.admin_list_enrolments('needs_approval') where applicant_email = 'o6@t.test'),
  'needs_approval', 'the administrator sees it as needing approval'
);
select lives_ok(
  format($$ select public.approve_enrolment(%L) $$,
         tests.id('req:o6')),
  'and approves it'
);
select tests.logout();
select is(
  (select listed_at is not null and approved_at is not null from public.enrolment_requests
    where applicant_id = (select id from public.profiles where email = 'o6@t.test')),
  true, 'now the teachers see it'
);

select tests.login_as('admin');
select lives_ok($$ select public.set_enrolment_settings(false, 5) $$, 'the administrator switches the form off');
select tests.logout();
select tests.mkoutsider('o7');
select tests.login_as('o7');
select throws_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'PT403', null, 'no new sign-up while it is off');
select tests.login_anon();
select is((public.enrolment_form_info() ->> 'enabled')::boolean, false, 'and the page is told');
select tests.logout();

select * from finish();
rollback;
