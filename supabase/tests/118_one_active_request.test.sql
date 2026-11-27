begin;
-- A student has one active request at a time and deletes it to make another one; a parent has one for each child.
select plan(15);

select tests.seed_basic();
select tests.mkoutsider('o1');

-- a student who has a teacher asks for a subject -------------------------------------------------------------------------------------------
select tests.login_as('s1');
select lives_ok($$ select public.start_enrolment(tests.id('subj:phys'), 'student') $$, 'a student asks for a subject');
select tests.logout();
select tests.reg('req:s1', id) from public.enrolment_requests where applicant_id = tests.id('p:s1');
select tests.login_as('s1');
select is(public.start_enrolment(tests.id('subj:math'), 'student'), tests.id('req:s1'), 'a request that is still being filled in is the one a second try gives back');
select tests.logout();
-- the profile is complete: the request is listed
update public.enrolment_requests set contact_phone = '+381641112223', consent_at = now(), profile_completed_at = now(), listed_at = now() where id = tests.id('req:s1');
select tests.login_as('s1');
select throws_ok($$ select public.start_enrolment(tests.id('subj:phys'), 'student') $$, 'PT409', null, 'but a listed one stops a request for another subject');
select is((select count(*)::int from public.my_enrolment_requests()), 1, 'there is one');
select tests.logout();

-- nobody else can delete it ----------------------------------------------------------------------------------------------------------------
select tests.login_as('s2');
select throws_ok(format($$ select public.cancel_enrolment_request(%L) $$, tests.id('req:s1')), 'PT404', null, 'another student cannot delete it');
select tests.logout();
select tests.login_anon();
select throws_ok(format($$ select public.cancel_enrolment_request(%L) $$, tests.id('req:s1')), '42501', null, 'nor a visitor');
select tests.logout();

-- the owner deletes it, and may ask again --------------------------------------------------------------------------------------------------
select tests.login_as('s1');
select lives_ok(format($$ select public.cancel_enrolment_request(%L) $$, tests.id('req:s1')), 'the student deletes their request');
select is((select count(*)::int from public.my_enrolment_requests()), 0, 'it is gone');
select lives_ok($$ select public.start_enrolment(tests.id('subj:math'), 'student') $$, 'and asks for another subject');
select tests.logout();

-- a request a teacher was placed on is not deleted -------------------------------------------------------------------------------------------
select tests.reg('req:s1b', id) from public.enrolment_requests where applicant_id = tests.id('p:s1');
update public.enrolment_requests set contact_phone = '+381641112223', consent_at = now(), profile_completed_at = now(), listed_at = now() where id = tests.id('req:s1b');
select tests.login_as('admin');
select is(public.admin_assign_enrolment(tests.id('req:s1b'), tests.id('p:tc')), 'assigned', 'a teacher is placed');
select tests.logout();
select tests.login_as('s1');
select throws_ok(format($$ select public.cancel_enrolment_request(%L) $$, tests.id('req:s1b')), 'PT409', null, 'and then the request is over: it cannot be deleted');
select lives_ok($$ select public.start_enrolment(tests.id('subj:phys'), 'student') $$, 'a request that is over does not stop a new one');
select tests.logout();

-- a parent has one request for each child ------------------------------------------------------------------------------------------------------
select tests.login_as('p1');
select lives_ok(format($$ select public.start_enrolment(%L, 'parent', %L) $$, tests.id('subj:math'), tests.id('p:s3')), 'a parent asks for a child');
select throws_ok(
  format($$ select public.start_enrolment(%L, 'parent', %L) $$, tests.id('subj:phys'), tests.id('p:s3')),
  'PT409', null, 'and not for the same child again'
);
select lives_ok(format($$ select public.start_enrolment(%L, 'parent', %L) $$, tests.id('subj:phys'), tests.id('p:s1')), 'but for another child at the same time');
select tests.logout();

select * from finish();
rollback;
