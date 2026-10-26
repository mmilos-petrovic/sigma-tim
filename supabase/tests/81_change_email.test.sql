-- An admin corrects a person's email.
begin;
select plan(36);

select tests.seed_basic();

-- people who matter for the cases below
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'pwonly@t.test', now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'google-new@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{"avatar_url":"https://example.test/new.png"}', now(), now());
update public.profiles set avatar_url = 'https://example.test/old.png' where id = tests.id('p:s1');

-- who may do it ---------------------------------------------------------------------------------------------------
select tests.login_as('tb');
select throws_ok($$ select public.change_profile_email(tests.id('p:s3'), 'x@t.test') $$, 'PT403', null, 'a teacher cannot change an email');
select tests.login_as('s1');
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), 'x@t.test') $$, 'PT403', null, 'nor can a person change their own');
select tests.login_as('outsider');
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), 'x@t.test') $$, 'PT403', null, 'nor an unknown Google account');
select tests.login_anon();
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), 'x@t.test') $$, '42501', null, 'nor anon');
select tests.logout();

-- what it refuses -----------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), 'not-an-email') $$, 'PT400', null, 'a malformed email');
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), '') $$, 'PT400', null, 'an empty email');
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), null) $$, 'PT400', null, 'a missing email');
select throws_ok($$ select public.change_profile_email(gen_random_uuid(), 'x@t.test') $$, 'PT404', null, 'an unknown person');
select throws_ok($$ select public.change_profile_email(tests.id('p:admin'), 'x@t.test') $$, 'PT403', null, 'the admin cannot change their own email');
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), 'ta@t.test') $$, 'PT409', null, 'an email that belongs to someone else');
select throws_ok($$ select public.change_profile_email(tests.id('p:s1'), '  TA@T.test ') $$, 'PT409', null, 'the same, in another spelling');
select tests.logout();
select is((select email from public.profiles where id = tests.id('p:s1')), 's1@t.test', 'a refused change changes nothing');

-- a change that touches nothing is not an error and does not log anyone out -----------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.change_profile_email(tests.id('p:s2'), ' S2@t.test ') $$, 'the same address in another spelling is accepted');
select tests.logout();
select is(
  (select user_id from public.profiles where id = tests.id('p:s2')), tests.id('u:s2'),
  'and the person stays signed in to their profile'
);

-- the change -------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.change_profile_email(tests.id('p:s1'), '  Typo-Fixed@T.test ') $$, 'the admin corrects s1''s email');
select tests.logout();

select is((select email from public.profiles where id = tests.id('p:s1')), 'typo-fixed@t.test', 'the new address is stored normalised');
select is((select user_id from public.profiles where id = tests.id('p:s1')), null, 'the old Google account is cut off');
select is((select avatar_url from public.profiles where id = tests.id('p:s1')), null, 'the old account''s picture goes with it');

-- the old account sees nothing: it is an unknown Google account now
select tests.login_as('s1');
select is((select count(*)::int from public.my_roles()), 0, 'the old account has no roles');
select is((select count(*)::int from public.profiles), 0, 'reads no profiles');
select is((select count(*)::int from public.students), 0, 'no students');
select is(tests.lesson_keys(), '{}'::text[], 'and no lessons');
select tests.logout();

-- what stays with the person ----------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from public.lesson_students where student_id = tests.id('s:s1')), 3,
  'lessons stay with the person (group, solo and past)'
);
select is((select teacher_id from public.students where id = tests.id('s:s1')), tests.id('p:ta'), 'and the teacher assignment');

-- linking to a Google account that already exists ----------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.change_profile_email(tests.id('p:p1'), 'google-new@t.test') $$, 'p1 gets the address of an existing Google account');
select tests.logout();
select is((select user_id from public.profiles where id = tests.id('p:p1')), '00000000-0000-4000-8000-0000000000b2'::uuid, 'the profile is linked to it at once');
select is((select avatar_url from public.profiles where id = tests.id('p:p1')), 'https://example.test/new.png', 'with that account''s picture');

select lives_ok($$ select tests.login_as('p1') $$, 'old p1 account signs in');
select is((select count(*)::int from public.my_roles()), 0, 'but has no roles any more');
select tests.logout();

-- a password-only account with that address is not trusted
select tests.login_as('admin');
select public.change_profile_email(tests.id('p:pu'), 'pwonly@t.test');
select tests.logout();
select is((select user_id from public.profiles where id = tests.id('p:pu')), null, 'an email/password account is never linked');

-- someone who signs in with the new address later
select tests.login_as('admin');
select public.change_profile_email(tests.id('p:p2'), 'later@t.test');
select tests.logout();
select is((select user_id from public.profiles where id = tests.id('p:p2')), null, 'no account yet, nothing to link');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'later@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{}', now(), now());
select is((select user_id from public.profiles where id = tests.id('p:p2')), '00000000-0000-4000-8000-0000000000b3'::uuid, 'the first Google sign-in with the new address links it');

-- a teacher keeps everything: students, lessons, CV ---------------------------------------------------------------------------
select tests.login_as('admin');
select public.change_profile_email(tests.id('p:ta'), 'ta-new@t.test');
select tests.logout();
select is((select count(*)::int from public.students where teacher_id = tests.id('p:ta')), 2, 'a teacher keeps their students');
select is((select count(*)::int from public.teacher_cv where teacher_id = tests.id('p:ta')), 1, 'and their CV');

select function_privs_are('public', 'change_profile_email', array['uuid', 'text'], 'anon', array[]::text[], 'anon may not execute it');
select function_privs_are('public', 'change_profile_email', array['uuid', 'text'], 'authenticated', array['EXECUTE'], 'authenticated may call it (admins only inside)');

select * from finish();
rollback;
