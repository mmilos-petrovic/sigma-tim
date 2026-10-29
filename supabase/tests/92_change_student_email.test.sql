-- A teacher corrects the email of their own student. Only when the person is theirs alone: somebody who studies with
-- another teacher, teaches, or is the parent of another teacher's child goes through the administrator.
begin;
select plan(36);

select tests.seed_basic();

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'google-new@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{"avatar_url":"https://example.test/new.png"}', now(), now());
update public.profiles set avatar_url = 'https://example.test/old.png' where id = tests.id('p:s1');
update public.profiles set avatar_url = 'https://example.test/s2.png' where id = tests.id('p:s2');

-- tc is a teacher and, privately, a student of ta
with i as (insert into public.students (profile_id, teacher_id) values (tests.id('p:tc'), tests.id('p:ta')) returning id)
select tests.reg('s:tc', id) from i;
-- the admin is, privately, a student of ta
with i as (insert into public.students (profile_id, teacher_id) values (tests.id('p:admin'), tests.id('p:ta')) returning id)
select tests.reg('s:ad', id) from i;
-- sh studies with both ta and tb (two records, one person)
select tests.mkstudent('sh', 'Test', 'Deljeni', 'ta');
insert into public.students (profile_id, teacher_id) values (tests.id('p:sh'), tests.id('p:tb'));
-- sp is a student of ta and the parent of tb's student s3
select tests.mkstudent('sp', 'Test', 'Roditelj', 'ta');
insert into public.parents (profile_id) values (tests.id('p:sp'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:sp'), tests.id('s:s3'));
-- sq is a student of ta and the parent of ta's own student s2
select tests.mkstudent('sq', 'Test', 'Svoj', 'ta');
insert into public.parents (profile_id) values (tests.id('p:sq'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:sq'), tests.id('s:s2'));

-- who may do it ---------------------------------------------------------------------------------------------------
select tests.login_as('tb');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, 'PT403', null, 'another teacher cannot');
select tests.login_as('tc');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, 'PT403', null, 'nor a teacher without that student');
select tests.login_as('s1');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, 'PT403', null, 'nor the student themselves');
select tests.login_as('p1');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, 'PT403', null, 'nor their parent');
select tests.login_as('admin');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, 'PT403', null, 'nor an admin who does not teach them (the admin has change_profile_email)');
select tests.login_as('boss');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, 'PT403', null, 'nor an admin who teaches somebody else');
select tests.login_as('outsider');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, 'PT403', null, 'nor an unknown Google account');
select tests.login_anon();
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'x@t.test') $$, '42501', null, 'nor anon');
select tests.login_as('ta');
select throws_ok($$ select public.change_student_email(tests.id('s:su'), 'x@t.test') $$, 'PT403', null, 'a student without a teacher is not theirs');
select throws_ok($$ select public.change_student_email(gen_random_uuid(), 'x@t.test') $$, 'PT403', null, 'an unknown student looks the same');

-- what it refuses ---------------------------------------------------------------------------------------------------
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'not-an-email') $$, 'PT400', null, 'a malformed email');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), '') $$, 'PT400', null, 'an empty email');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), null) $$, 'PT400', null, 'a missing email');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), 'tb@t.test') $$, 'PT409', null, 'an email that belongs to someone else');
select throws_ok($$ select public.change_student_email(tests.id('s:s1'), '  TB@T.test ') $$, 'PT409', null, 'the same, in another spelling');
select throws_ok($$ select public.change_student_email(tests.id('s:tc'), 'x@t.test') $$, 'PT403', null, 'a colleague who is also their student: only the admin');
select throws_ok($$ select public.change_student_email(tests.id('s:ad'), 'x@t.test') $$, 'PT403', null, 'the admin, even as a student: only through change_profile_email');
select throws_ok($$ select public.change_student_email(tests.id('s:sh'), 'x@t.test') $$, 'PT409', null, 'a person who studies with another teacher too: only the admin');
select throws_ok($$ select public.change_student_email(tests.id('s:sp'), 'x@t.test') $$, 'PT409', null, 'a parent of another teacher''s child: only the admin');
select tests.logout();
select is((select email from public.profiles where id = tests.id('p:s1')), 's1@t.test', 'a refused change changes nothing');
select is((select email from public.profiles where id = tests.id('p:sh')), 'sh@t.test', 'not even for the shared person');

-- a change that touches nothing does not log anyone out ---------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.change_student_email(tests.id('s:s2'), ' S2@t.test ') $$, 'the same address in another spelling is accepted');
select tests.logout();
select is((select user_id from public.profiles where id = tests.id('p:s2')), tests.id('u:s2'), 'and the student stays signed in to their profile');
select is((select avatar_url from public.profiles where id = tests.id('p:s2')), 'https://example.test/s2.png', 'and nothing about the profile was touched');

-- the change -------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select public.change_student_email(tests.id('s:s1'), '  Typo-Fixed@T.test ') $$, 'the teacher corrects s1''s email');
select tests.logout();
select is((select email from public.profiles where id = tests.id('p:s1')), 'typo-fixed@t.test', 'the new address is stored normalised');
select is((select user_id from public.profiles where id = tests.id('p:s1')), null, 'the old Google account is cut off');
select is((select avatar_url from public.profiles where id = tests.id('p:s1')), null, 'and its picture goes with it');
select is(
  (select teacher_id from public.students where id = tests.id('s:s1')), tests.id('p:ta'),
  'the student is still the teacher''s'
);
select is(
  (select count(*)::int from public.lesson_students where student_id = tests.id('s:s1')), 3,
  'and keeps their lessons'
);

select tests.login_as('s1');
select is((select count(*)::int from public.my_roles()), 0, 'the old account has no roles any more');
select is((select count(*)::int from public.lessons), 0, 'and reads no lessons');
select tests.logout();

-- the new address is recognised when its owner signs in ------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'typo-fixed@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{}', now(), now());
select is(
  (select user_id from public.profiles where id = tests.id('p:s1')), '00000000-0000-4000-8000-0000000000c2'::uuid,
  'the first Google sign-in with the corrected address claims the profile'
);

-- a Google account that already exists is linked at once; a parent of the teacher's own student may be corrected too --------------
select tests.login_as('ta');
select lives_ok($$ select public.change_student_email(tests.id('s:sq'), 'google-new@t.test') $$, 'the corrected address already has a Google account');
select tests.logout();
select is(
  (select user_id from public.profiles where id = tests.id('p:sq')), '00000000-0000-4000-8000-0000000000c1'::uuid,
  'the profile is linked to it immediately'
);

-- a deactivated teacher can do nothing ---------------------------------------------------------------------------------------
update public.teachers set is_active = false where profile_id = tests.id('p:ta');
select tests.login_as('ta');
select throws_ok($$ select public.change_student_email(tests.id('s:s2'), 'late@t.test') $$, 'PT403', null, 'a deactivated teacher can no longer change anything');

select tests.logout();
select * from finish();
rollback;
