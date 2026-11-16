-- Enrolment, part 2: the pool the teachers see, offers, the job that opens the choice, choosing, and placing a teacher.
begin;
select plan(62);

select tests.seed_basic();
select tests.mkoutsider('o2');
select tests.mkoutsider('o3');
-- ta and tb have a CV; boss and tc get one too, because a teacher needs the "about" text to offer. ta hides hers from everybody.
insert into public.teacher_cv (teacher_id, about) values (tests.id('p:tc'), 'About Gama'), (tests.id('p:boss'), 'About Boss');
update public.teacher_cv set show_public = false, show_members = false where id = tests.id('cv:ta');

-- three people sign up and finish their profile: a student for mathematics, a parent for mathematics, a student for physics
select tests.login_as('outsider');
select public.start_enrolment(tests.id('subj:math'), 'student');
select tests.login_as('o2');
select public.start_enrolment(tests.id('subj:math'), 'parent');
select tests.login_as('o3');
select public.start_enrolment(tests.id('subj:phys'), 'student');
select tests.logout();
select tests.reg('req:pera', id) from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'outsider@t.test');
select tests.reg('req:mara', id) from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'o2@t.test');
select tests.reg('req:sima', id) from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'o3@t.test');

select tests.login_as('outsider');
select public.complete_enrolment_profile(tests.id('req:pera'), 'Pera', 'Peric', '+381641000001', 'Skola 1', '5', 'Zvezdara', 'Trojka iz matematike', true);
select tests.login_as('o2');
select public.complete_enrolment_profile(tests.id('req:mara'), 'Mara', 'Maric', '+381641000002', 'Skola 2', '6', null, null, true);
select tests.login_as('o3');
select public.complete_enrolment_profile(tests.id('req:sima'), 'Sima', 'Simic', '+381641000003', 'Skola 3', '7', null, null, true);
select tests.logout();
-- the parent has waited 1 day, the first student 3 and a half days
update public.enrolment_requests set listed_at = now() - interval '1 day' where id = tests.id('req:mara');
update public.enrolment_requests set listed_at = now() - interval '3.5 days' where id = tests.id('req:pera');

-- who sees the pool -----------------------------------------------------------------------------------------------------------------
-- (no ordering of its own: the order is the one the function returns)
create function tests.pool() returns text[] language sql as $$
  select coalesce(array_agg(q.n), '{}') from (select student_first_name as n from public.list_enrolment_pool() where source <> 'legacy') q
$$;

select tests.login_as('ta');
select is(tests.pool(), array['Mara', 'Pera'], 'a mathematics teacher sees the mathematics requests, newest first');
select is(
  (select row(applicant_role, applicant_email, phone, school, grade, city_part, situation, days_waiting, offered, subject_name)::text
     from public.list_enrolment_pool() where student_first_name = 'Pera'),
  row('student', 'outsider@t.test', '+381641000001', 'Skola 1', '5', 'Zvezdara', 'Trojka iz matematike', 3, false, 'Test Matematika')::text,
  'with everything typed, the phone and the email, whether it is a student or a parent, and the days waited'
);
select is((select applicant_role::text from public.list_enrolment_pool() where student_first_name = 'Mara'), 'parent', 'a parent is marked as one');
select tests.login_as('tb');
select is(tests.pool(), array['Sima'], 'a physics teacher only the physics one');
select tests.login_as('boss');
select is(tests.pool(), array['Sima', 'Mara', 'Pera'], 'a teacher of both sees all three, newest first');
select tests.login_as('tc');
select is(tests.pool(), array['Mara', 'Pera'], 'another mathematics teacher too');
select tests.login_as('s1');
select throws_ok($$ select * from public.list_enrolment_pool() $$, 'PT403', null, 'a student does not see the pool');
select tests.login_as('p1');
select throws_ok($$ select * from public.list_enrolment_pool() $$, 'PT403', null, 'nor a parent');
select tests.login_as('admin');
select throws_ok($$ select * from public.list_enrolment_pool() $$, 'PT403', null, 'nor an administrator who does not teach');
select tests.login_as('outsider');
select throws_ok($$ select * from public.list_enrolment_pool() $$, 'PT403', null, 'nor the person who is waiting');
select tests.login_anon();
select throws_ok($$ select * from public.list_enrolment_pool() $$, '42501', null, 'nor a visitor');
select tests.logout();

-- offers ------------------------------------------------------------------------------------------------------------------------
update public.teacher_cv set about = null where teacher_id = tests.id('p:tc');
select tests.login_as('tc');
select throws_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pera')), 'PT409', null, 'a teacher without the about text of a CV cannot offer');
select tests.logout();
update public.teacher_cv set about = 'About Gama' where teacher_id = tests.id('p:tc');

select tests.login_as('tb');
select throws_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pera')), 'PT404', null, 'a teacher who does not teach the subject cannot offer');
select tests.login_as('s1');
select throws_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pera')), 'PT403', null, 'a student cannot offer');
select tests.login_as('ta');
select lives_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pera')), 'a teacher with a CV offers for a student of their subject');
select lives_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pera')), 'offering twice changes nothing');
select is((select offered from public.list_enrolment_pool() where student_first_name = 'Pera'), true, 'the pool shows the offer');
select tests.logout();
select is(
  (select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id
    where n.kind = 'enrolment_offer' and p.email = 'outsider@t.test' and n.payload ->> 'teacher' = 'Test Alfa'),
  1, 'the person is told once about the offer'
);

-- what the person who is waiting sees ------------------------------------------------------------------------------------------------
select tests.login_as('outsider');
select is(
  (select row(offers_count, choice_open, status, days_waiting, listed)::text from public.my_enrolment_requests()),
  row(1, false, 'open', 3, true)::text, 'one offer, the choice is not open, three days waited'
);
select is(
  (select row(first_name, last_name, is_chosen, cv_slug is not null)::text from public.my_enrolment_offers(tests.id('req:pera'))),
  row('Test', 'Alfa', false, true)::text, 'they see who offered and that there is a CV'
);
select is(
  (select public.get_offered_cv(tests.id('req:pera'), tests.id('p:ta')) ->> 'about'),
  'About Alfa', 'they read that CV, although the teacher switched off both ways of showing it'
);
select is(
  (select row(jsonb_array_length(c -> 'experience'), jsonb_array_length(c -> 'education'), jsonb_array_length(c -> 'skills'))::text
     from (select public.get_offered_cv(tests.id('req:pera'), tests.id('p:ta')) as c) x),
  row(1, 1, 1)::text, 'with its experience, education and skills'
);
select is(public.get_offered_cv(tests.id('req:pera'), tests.id('p:tb')), null, 'but not the CV of a teacher who did not offer');
select throws_ok(format($$ select public.choose_enrolment_teacher(%L, %L) $$, tests.id('req:pera'), tests.id('p:ta')), 'PT409', null, 'the choice is not open yet');
select tests.login_as('o2');
select throws_ok(format($$ select * from public.my_enrolment_offers(%L) $$, tests.id('req:pera')), 'PT404', null, 'somebody else''s offers are not visible');
select throws_ok(format($$ select public.get_offered_cv(%L, %L) $$, tests.id('req:pera'), tests.id('p:ta')), 'PT404', null, 'nor their CVs');
select is((select count(*)::int from public.my_enrolment_requests()), 1, 'each person sees their own request only');
select tests.login_as('s1');
select is((select count(*)::int from public.my_enrolment_requests()), 0, 'a member sees none');
select tests.logout();

-- the job: nothing happens too early, nor when nobody offered ------------------------------------------------------------------------------
select is(private.advance_enrolments(), 0, 'one offer and a fresh waiting period: the choice stays closed');
update public.enrolment_requests set window_started_at = now() - interval '4 days' where id in (tests.id('req:mara'), tests.id('req:pera'));
select is(private.advance_enrolments(), 1, 'after the days the choice opens for the request that has an offer');
select is(
  (select row(choice_opened_at is not null, restarts)::text from public.enrolment_requests where id = tests.id('req:pera')),
  row(true, 0)::text, 'that one is open'
);
select is(
  (select row(choice_opened_at is null, restarts, window_started_at > now() - interval '1 minute')::text from public.enrolment_requests where id = tests.id('req:mara')),
  row(true, 1, true)::text, 'the one nobody offered for starts waiting again and counts the restart'
);
select is(private.advance_enrolments(), 0, 'and nothing opens twice');
select is(
  (select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id
    where n.kind = 'enrolment_choice_open' and p.email = 'outsider@t.test'),
  1, 'the person is told that the choice is open, once'
);

-- the third offer opens the choice at once ----------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select public.offer_enrolment(tests.id('req:mara'));
select tests.login_as('tc');
select public.offer_enrolment(tests.id('req:mara'));
select tests.logout();
select is(private.advance_enrolments(), 0, 'two offers are not enough');
select tests.login_as('boss');
select public.offer_enrolment(tests.id('req:mara'));
select tests.logout();
select is(private.advance_enrolments(), 1, 'the third one opens the choice, without waiting for the days');
select is((select choice_opened_at is not null from public.enrolment_requests where id = tests.id('req:mara')), true, 'it is marked open');

-- choosing: a student -------------------------------------------------------------------------------------------------------------------------
select tests.login_as('outsider');
select throws_ok(format($$ select public.choose_enrolment_teacher(%L, %L) $$, tests.id('req:pera'), tests.id('p:tc')), 'PT400', null, 'only a teacher who offered can be chosen');
select tests.login_as('o2');
select throws_ok(format($$ select public.choose_enrolment_teacher(%L, %L) $$, tests.id('req:pera'), tests.id('p:ta')), 'PT404', null, 'and only by the one it is about');
select tests.login_as('outsider');
select is(public.choose_enrolment_teacher(tests.id('req:pera'), tests.id('p:ta')), 'assigned', 'the student chooses the teacher who offered');
select is(
  (select row(is_student, is_admin or is_teacher or is_parent)::text from public.my_roles()),
  row(true, false)::text, 'and becomes a student'
);
select tests.logout();
select is(
  (select row(s.teacher_id = tests.id('p:ta'), s.school, s.grade, p.first_name, p.last_name)::text
     from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'outsider@t.test'),
  row(true, 'Skola 1', '5', 'Pera', 'Peric')::text, 'the student record holds the teacher, school and grade, and the profile has the typed name'
);
select is((select phone from public.person_phones where profile_id = (select id from public.profiles where email = 'outsider@t.test')), '+381641000001', 'the phone number is kept');
select is(
  (select count(*)::int from public.notifications where kind = 'enrolment_chosen' and recipient_id = tests.id('p:ta')
      and payload ->> 'student' = 'Pera Peric' and (payload ->> 'needs_child_email')::boolean = false),
  1, 'the teacher is told they were chosen'
);
select tests.login_as('outsider');
select throws_ok(format($$ select public.choose_enrolment_teacher(%L, %L) $$, tests.id('req:pera'), tests.id('p:ta')), 'PT409', null, 'a second choice is refused');
select throws_ok(format($$ select public.complete_enrolment_profile(%L, 'Pera', 'Peric', '+381641000001', 'Skola', '5', null, null, true) $$, tests.id('req:pera')), 'PT409', null, 'and the profile is closed for changes');
select tests.logout();

-- choosing: a parent --------------------------------------------------------------------------------------------------------------------------
select tests.login_as('o2');
select is(public.choose_enrolment_teacher(tests.id('req:mara'), tests.id('p:ta')), 'chosen', 'a parent chooses; the teacher still has to give the child''s email');
select is(
  (select count(*)::int from public.my_enrolment_offers(tests.id('req:mara'))), 1, 'the other offers are closed'
);
select is((select is_parent from public.my_roles()), false, 'the parent is not a parent of anybody yet');
select tests.login_as('ta');
select is((select array_agg(student_first_name) from public.list_chosen_enrolments()), array['Mara'], 'the teacher sees whose child they must complete');
select throws_ok(format($$ select public.complete_chosen_enrolment(%L, 'o2@t.test') $$, tests.id('req:mara')), 'PT400', null, 'the child needs an email of their own');
select tests.login_as('tc');
select throws_ok(format($$ select public.complete_chosen_enrolment(%L, 'kid@t.test') $$, tests.id('req:mara')), 'PT404', null, 'another teacher cannot complete it');
select tests.login_as('ta');
select lives_ok(format($$ select public.complete_chosen_enrolment(%L, 'kid@t.test') $$, tests.id('req:mara')), 'the chosen teacher gives the email');
select tests.logout();
select is(
  (select row(s.teacher_id = tests.id('p:ta'), cp.first_name, cp.last_name, ps.parent_id = (select id from public.profiles where email = 'o2@t.test'))::text
     from public.students s join public.profiles cp on cp.id = s.profile_id
     join public.parent_students ps on ps.student_id = s.id where cp.email = 'kid@t.test'),
  row(true, 'Mara', 'Maric', true)::text, 'the child is a student of the teacher, with the typed name, and the parent is linked'
);
select is((select status::text from public.enrolment_requests where id = tests.id('req:mara')), 'assigned', 'the request is done');

-- withdrawing, closed requests and teachers who leave ---------------------------------------------------------------------------------------------------
select tests.login_as('tb');
select public.offer_enrolment(tests.id('req:sima'));
select tests.login_as('boss');
select public.withdraw_enrolment_offer(tests.id('req:sima'));
select tests.logout();
select is((select count(*)::int from public.enrolment_offers where request_id = tests.id('req:sima')), 1, 'a teacher withdraws only their own offer');
select tests.login_as('tb');
select public.withdraw_enrolment_offer(tests.id('req:sima'));
select tests.logout();
select is((select count(*)::int from public.enrolment_offers where request_id = tests.id('req:sima')), 0, 'and can withdraw it');
select tests.login_as('tb');
select public.offer_enrolment(tests.id('req:sima'));
select tests.logout();
update public.teachers set is_active = false where profile_id = tests.id('p:tb');
select is((select count(*)::int from public.enrolment_offers where request_id = tests.id('req:sima')), 0, 'the offers of a teacher who is deactivated disappear');

select tests.login_as('tc');
select throws_ok(format($$ select public.offer_enrolment(%L) $$, tests.id('req:pera')), 'PT404', null, 'nobody can offer for a request that is done');
select tests.login_as('ta');
select throws_ok(format($$ select public.withdraw_enrolment_offer(%L) $$, tests.id('req:pera')), 'PT409', null, 'nor withdraw from one');
select tests.logout();

-- a parent's choice goes back to open when the chosen teacher is deactivated
select tests.mkoutsider('o4');
select tests.login_as('o4');
select public.start_enrolment(tests.id('subj:math'), 'parent');
select tests.logout();
select tests.reg('req:four', id) from public.enrolment_requests where applicant_id = (select id from public.profiles where email = 'o4@t.test');
select tests.login_as('o4');
select public.complete_enrolment_profile(tests.id('req:four'), 'Ceda', 'Cedic', '+381641000004', 'Skola 4', '8', null, null, true);
select tests.login_as('boss');
select public.offer_enrolment(tests.id('req:four'));
select tests.logout();
update public.enrolment_requests set choice_opened_at = now() where id = tests.id('req:four');
select tests.login_as('o4');
select public.choose_enrolment_teacher(tests.id('req:four'), tests.id('p:boss'));
select tests.logout();
select is((select status::text from public.enrolment_requests where id = tests.id('req:four')), 'chosen', 'a parent chose the administrator-teacher');
update public.teachers set is_active = false where profile_id = tests.id('p:boss');
select is(
  (select row(status::text, chosen_teacher_id is null)::text from public.enrolment_requests where id = tests.id('req:four')),
  row('open', true)::text, 'when that teacher is deactivated the request is open again'
);

select * from finish();
rollback;
