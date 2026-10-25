begin;
select plan(17);

-- Pre-approved profile, user signs in afterwards (the usual order).
insert into public.profiles (email, first_name, last_name) values ('first@t.test', 'First', 'Login');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'first@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{"avatar_url":"https://example.test/a.png"}', now(), now());

select is(
  (select user_id from public.profiles where email = 'first@t.test'),
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  'signing in with Google links the pre-approved profile'
);
select is(
  (select avatar_url from public.profiles where email = 'first@t.test'),
  'https://example.test/a.png',
  'the Google picture becomes the initial avatar'
);

-- Someone signs in first, is told "you are not a member", a teacher adds them later.
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'late@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{}', now(), now());
insert into public.profiles (email, first_name, last_name) values ('late@t.test', 'Late', 'Added');

select is(
  (select user_id from public.profiles where email = 'late@t.test'),
  '00000000-0000-4000-8000-0000000000a2'::uuid,
  'a profile created after the first sign-in is linked to the existing account'
);

-- Email matching ignores case and surrounding blanks.
insert into public.profiles (email, first_name, last_name) values ('  MiXed@T.test ', 'Mixed', 'Case');
select is((select email from public.profiles where first_name = 'Mixed'), 'mixed@t.test', 'profile emails are stored normalised');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'MIXED@t.test', now(),
        '{"provider":"google","providers":["google"]}', '{}', now(), now());
select is(
  (select user_id from public.profiles where first_name = 'Mixed'),
  '00000000-0000-4000-8000-0000000000a3'::uuid,
  'linking matches emails case-insensitively'
);

-- Only Google sign-ins may claim a pre-approved email; a password signup with the same address must not.
insert into public.profiles (email, first_name, last_name) values ('victim@t.test', 'Victim', 'Profile');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated', 'victim@t.test', now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now());
select is(
  (select user_id from public.profiles where email = 'victim@t.test'),
  null,
  'an email/password signup does not take over a pre-approved profile'
);

-- Unconfirmed emails are not trusted either.
insert into public.profiles (email, first_name, last_name) values ('unconfirmed@t.test', 'Un', 'Confirmed');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a5', 'authenticated', 'authenticated', 'unconfirmed@t.test', null,
        '{"provider":"google","providers":["google"]}', '{}', now(), now());
select is(
  (select user_id from public.profiles where email = 'unconfirmed@t.test'),
  null,
  'an unconfirmed email is not linked'
);

-- GoTrue does not always write a user in one go: the admin API (and possibly the OAuth flow) inserts the row first and
-- sets the provider and the email confirmation afterwards. Linking has to follow that order too.
insert into public.profiles (email, first_name, last_name) values ('twostep@t.test', 'Two', 'Step');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a6', 'authenticated', 'authenticated', 'twostep@t.test', null,
        '{"provider":"email","providers":["email"]}', '{}', now(), now());
select is(
  (select user_id from public.profiles where email = 'twostep@t.test'),
  null,
  'a row inserted as an unconfirmed email account is not linked yet'
);
update auth.users
   set email_confirmed_at = now(),
       raw_app_meta_data = '{"provider":"google","providers":["google"]}',
       raw_user_meta_data = '{"avatar_url":"https://example.test/two.png"}'
 where id = '00000000-0000-4000-8000-0000000000a6';
select is(
  (select user_id from public.profiles where email = 'twostep@t.test'),
  '00000000-0000-4000-8000-0000000000a6'::uuid,
  'confirming and marking the account as Google afterwards links the profile'
);
select is(
  (select avatar_url from public.profiles where email = 'twostep@t.test'),
  'https://example.test/two.png',
  'the Google picture is taken over in the two-step order as well'
);

-- Confirming a password account must not link it.
insert into public.profiles (email, first_name, last_name) values ('pwconfirm@t.test', 'Pw', 'Confirm');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a7', 'authenticated', 'authenticated', 'pwconfirm@t.test', null,
        '{"provider":"email","providers":["email"]}', '{}', now(), now());
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000a7';
select is(
  (select user_id from public.profiles where email = 'pwconfirm@t.test'),
  null,
  'confirming an email/password account does not link it'
);

-- Deleting the auth user keeps the profile and frees it for a new sign-in.
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
select is(
  (select user_id from public.profiles where email = 'first@t.test'),
  null,
  'deleting the auth user unlinks the profile but keeps it'
);

-- What the linked / unlinked accounts can see.
select tests.seed_basic();
select tests.login_as('outsider');
select is((select count(*)::int from public.profiles), 0, 'a Google account without a profile sees no profiles');
select is((select count(*)::int from public.lessons), 0, 'a Google account without a profile sees no lessons');
select is((select count(*)::int from public.subjects), 0, 'a Google account without a profile does not even see the subject list');

select tests.login_as('s1');
select is((select count(*)::int from public.profiles where id = tests.id('p:s1')), 1, 'a linked student sees their own profile');

select tests.login_anon();
select throws_ok($$ select count(*) from public.profiles $$, '42501', null, 'anon cannot read profiles');

select tests.logout();
select * from finish();
rollback;
