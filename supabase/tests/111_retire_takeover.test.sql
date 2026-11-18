-- Phase 7d: the sign-up form starts switched off, and the takeover of unassigned students is replaced by offers.
begin;
select plan(20);

-- the form -------------------------------------------------------------------------------------------------------------------
-- (the other test files switch it on in seed_basic; this one looks at what a real database starts with)
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'enrolment_settings' and column_name = 'form_enabled'),
  'false', 'a database that gets the settings row for the first time starts with the form switched off');
select is((select form_enabled from public.enrolment_settings), false, 'and the row of this database is switched off too');

select tests.seed_basic();
select tests.reg('req:su', id) from public.enrolment_requests where student_id = tests.id('s:su');
-- a second student nobody teaches, whose request is closed already
select tests.mkstudent('su2', 'Test', 'Zatvoren', null);
update public.enrolment_requests set status = 'rejected' where student_id = tests.id('s:su2');
-- a third one, who waits, for whom a request was answered long ago
select tests.mkstudent('su3', 'Test', 'Odgovoren', null);

-- the old functions are gone ---------------------------------------------------------------------------------------------------
select hasnt_function('public', 'request_takeover', array['uuid'], 'a teacher no longer asks for a student');
select hasnt_function('public', 'approve_takeover', array['uuid'], 'the administrator no longer approves');
select hasnt_function('public', 'reject_takeover', array['uuid'], 'nor rejects');
select has_table('public', 'takeover_requests', 'the record of the old requests stays');

-- pending requests become offers ---------------------------------------------------------------------------------------------------
-- tb and tc asked for su (tb has offered as well, the new way); ta asked for s1, who has a teacher; a deactivated teacher asked too
select tests.mkteacher('gone', 'Test', 'Otisao', array['math']);
insert into public.takeover_requests (student_id, teacher_id, created_at) values
  (tests.id('s:su'), tests.id('p:tb'), now() - interval '5 days'),
  (tests.id('s:su'), tests.id('p:tc'), now() - interval '4 days'),
  (tests.id('s:su'), tests.id('p:gone'), now() - interval '3 days'),
  (tests.id('s:s1'), tests.id('p:tc'), now() - interval '2 days'),
  (tests.id('s:su2'), tests.id('p:tc'), now() - interval '1 day');
insert into public.takeover_requests (student_id, teacher_id, status, resolved_at, created_at)
values (tests.id('s:su3'), tests.id('p:tb'), 'rejected', now() - interval '20 days', now() - interval '30 days');
insert into public.enrolment_offers (request_id, teacher_id) values (tests.id('req:su'), tests.id('p:tb'));
update public.teachers set is_active = false where profile_id = tests.id('p:gone');

select is(private.convert_takeovers_to_offers(), 1, 'one offer is made: the one that was not an offer yet, for a teacher who is active, for a student who waits');
select is(
  (select array_agg(teacher_id order by teacher_id) from public.enrolment_offers where request_id = tests.id('req:su')),
  (select array_agg(x order by x) from unnest(array[tests.id('p:tb'), tests.id('p:tc')]) x),
  'the student has the offers of both teachers');
select is(
  (select count(*)::int from public.enrolment_offers where request_id = tests.id('req:su') and teacher_id = tests.id('p:tb')), 1,
  'and the one who had offered already has one offer, not two');
select ok(
  (select created_at < now() - interval '3 days 23 hours' and created_at > now() - interval '4 days 1 hour'
     from public.enrolment_offers where request_id = tests.id('req:su') and teacher_id = tests.id('p:tc')),
  'the offer has the date of the request');
select is(
  (select count(*)::int from public.enrolment_offers where teacher_id in (tests.id('p:gone'), tests.id('p:ta'))), 0,
  'a deactivated teacher, and a student who has a teacher, get no offer');
select is(
  (select count(*)::int from public.enrolment_offers o join public.enrolment_requests r on r.id = o.request_id
    where r.student_id = tests.id('s:su2')), 0,
  'a student whose request is closed gets no offer');
select is(
  (select count(*)::int from public.enrolment_offers o join public.enrolment_requests r on r.id = o.request_id
    where r.student_id = tests.id('s:su3')), 0,
  'a request that was answered long ago is not an offer');
select is((select count(*)::int from public.takeover_requests where status = 'pending'), 0, 'no request is pending any more');
select is(
  (select count(*)::int from public.takeover_requests where status = 'rejected' and resolved_at is not null), 6,
  'every one is closed, with the time it was closed');
select is(private.convert_takeovers_to_offers(), 0, 'doing it again changes nothing');

-- what a signed-in person sees ------------------------------------------------------------------------------------------------------
-- (the person who waits sees both teachers, with the phone and the CV they decide by)
select tests.login_as('su');
select is(
  (select array_agg(last_name order by last_name) from public.my_enrolment_offers(tests.id('req:su'))),
  array['Beta', 'Gama'], 'the student sees the teachers who offered');
select tests.login_as('tc');
select is(
  (select offered from public.list_enrolment_pool() where request_id = tests.id('req:su')), true,
  'and the teacher whose request became an offer sees that they have offered');
select tests.logout();

select ok(not has_function_privilege('authenticated', 'private.convert_takeovers_to_offers()', 'execute'),
  'nobody but the migration runs the conversion');
select ok(not has_function_privilege('anon', 'private.convert_takeovers_to_offers()', 'execute'), 'and not a visitor');

select * from finish();
rollback;
