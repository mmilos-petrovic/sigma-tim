-- Subjects, locations, rooms, photos (admin writes, members read) and push subscriptions (owner only).
begin;
select plan(44);

select tests.seed_basic();

-- admin writes --------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ insert into public.subjects (name) values ('Test Hemija') $$, 'admin can add a subject');
select lives_ok($$ insert into public.locations (name, address) values ('Test Novi Beograd', 'Ulica 3') $$, 'admin can add a location');
select lives_ok($$ insert into public.rooms (location_id, name) values (tests.id('loc:L1'), 'Ucionica 9') $$, 'admin can add a room');
select lives_ok(
  $$ insert into public.location_photos (location_id, storage_path, position) values (tests.id('loc:L1'), 'locations/1.jpg', 1) $$,
  'admin can add a location photo'
);
select is(tests.affected($$ update public.subjects set name = 'Test Matematika 2' where id = tests.id('subj:math') $$), 1,
  'admin can rename a subject');

-- everybody else may not -----------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ insert into public.subjects (name) values ('Test Hacked') $$, '42501', null, 'a teacher cannot add a subject');
select throws_ok($$ insert into public.locations (name, address) values ('Test Hacked', 'x') $$, '42501', null,
  'a teacher cannot add a location');
select throws_ok($$ insert into public.rooms (location_id, name) values (tests.id('loc:L1'), 'Hacked') $$, '42501', null,
  'a teacher cannot add a room');
select is(tests.affected($$ update public.subjects set name = 'Hacked' where id = tests.id('subj:math') $$), 0,
  'a teacher cannot rename a subject');
select is(tests.affected($$ delete from public.rooms where id = tests.id('room:R1') $$), 0, 'a teacher cannot delete a room');

select tests.login_as('s1');
select throws_ok($$ insert into public.subjects (name) values ('Test Hacked') $$, '42501', null, 'a student cannot add a subject');

-- reading ---------------------------------------------------------------------------------------
select is((select count(*)::int from public.subjects where id = any(tests.ids('subj:'))), 2, 'a student reads the subjects');
select is((select count(*)::int from public.locations where id = any(tests.ids('loc:'))), 2, 'a student reads the locations');
select is((select count(*)::int from public.rooms where id = any(tests.ids('room:'))), 3, 'a student reads the rooms');

select tests.login_as('outsider');
select is((select count(*)::int from public.subjects where id = any(tests.ids('subj:'))), 0, 'an unknown Google account reads nothing');

select tests.login_anon();
select throws_ok($$ select count(*) from public.subjects $$, '42501', null, 'anon cannot read subjects');

-- locations, rooms and photos: members read, only admin writes ---------------------------------------
-- (admin added a photo of Test Centar above)
select tests.login_as('ta');
select is(tests.affected($$ update public.locations set name = 'Hacked' where id = tests.id('loc:L1') $$), 0, 'a teacher cannot rename a location');
select is(tests.affected($$ delete from public.locations where id = tests.id('loc:L2') $$), 0, 'a teacher cannot delete a location');
select is(tests.affected($$ update public.rooms set name = 'Hacked' where id = tests.id('room:R1') $$), 0, 'a teacher cannot rename a room');
select is((select count(*)::int from public.location_photos where location_id = tests.id('loc:L1')), 1, 'a teacher sees location photos');
select is(tests.affected($$ update public.location_photos set position = 3 where location_id = tests.id('loc:L1') $$), 0,
  'a teacher cannot move a photo');
select is(tests.affected($$ delete from public.location_photos where location_id = tests.id('loc:L1') $$), 0, 'a teacher cannot delete a photo');
select throws_ok(
  $$ insert into public.location_photos (location_id, storage_path, position) values (tests.id('loc:L1'), 'locations/x.jpg', 2) $$,
  '42501', null, 'a teacher cannot add a photo'
);

select tests.login_as('outsider');
select is((select count(*)::int from public.locations where id = any(tests.ids('loc:'))), 0, 'an unknown Google account reads no locations');
select is((select count(*)::int from public.rooms where id = any(tests.ids('room:'))), 0, 'nor rooms');
select is((select count(*)::int from public.location_photos), 0, 'nor photos');

-- constraints (as the table owner) -------------------------------------------------------------
select tests.logout();
select throws_ok(
  $$ insert into public.location_photos (location_id, storage_path, position) values (tests.id('loc:L1'), 'locations/4.jpg', 4) $$,
  '23514', null, 'a location has at most three photos'
);
select throws_ok(
  $$ insert into public.location_photos (location_id, storage_path, position) values (tests.id('loc:L1'), 'locations/dup.jpg', 1) $$,
  '23505', null, 'photo positions are unique per location'
);
select throws_ok(
  $$ insert into public.rooms (location_id, name) values (tests.id('loc:L1'), 'Ucionica 1') $$,
  '23505', null, 'room names are unique within a location'
);

-- a teacher keeps at least one subject -----------------------------------------------------------
select tests.login_as('admin');
select lives_ok(
  $$ insert into public.teacher_subjects (teacher_id, subject_id) values (tests.id('p:tc'), tests.id('subj:phys')) $$,
  'admin can add a subject to a teacher'
);
select lives_ok(
  $$ delete from public.teacher_subjects where teacher_id = tests.id('p:tc') and subject_id = tests.id('subj:math') $$,
  'admin can remove one of two subjects'
);
select throws_ok(
  $$ delete from public.teacher_subjects where teacher_id = tests.id('p:tc') and subject_id = tests.id('subj:phys') $$,
  'PT409', null, 'the last subject of an active teacher cannot be removed'
);

select tests.login_as('ta');
select throws_ok(
  $$ insert into public.teacher_subjects (teacher_id, subject_id) values (tests.id('p:ta'), tests.id('subj:phys')) $$,
  '42501', null, 'a teacher cannot give themselves a subject'
);
select is(tests.affected($$ delete from public.teacher_subjects where teacher_id = tests.id('p:ta') $$), 0,
  'a teacher cannot remove their own subjects');

-- push subscriptions -----------------------------------------------------------------------------
select tests.login_as('s1');
select lives_ok(
  $$ insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
     values (tests.id('p:s1'), 'https://push.example/s1', 'key', 'secret', 'phone') $$,
  'a user registers a device for push'
);
select throws_ok(
  $$ insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
     values (tests.id('p:ta'), 'https://push.example/evil', 'key', 'secret') $$,
  '42501', null, 'a user cannot register a device for someone else'
);
select is((select count(*)::int from public.push_subscriptions), 1, 'a user sees their own devices');
select is(tests.affected($$ update public.push_subscriptions set user_agent = 'tablet' $$), 1, 'a user can update their own device');

select tests.login_as('ta');
select is((select count(*)::int from public.push_subscriptions), 0, 'other users do not see the device');
select is(tests.affected($$ update public.push_subscriptions set user_agent = 'hacked' $$), 0, 'other users cannot change it');
select is(tests.affected($$ delete from public.push_subscriptions $$), 0, 'other users cannot delete it');

select tests.login_as('admin');
select is((select count(*)::int from public.push_subscriptions), 0, 'not even admin can read push subscriptions');

select tests.login_as('s1');
select is(tests.affected($$ delete from public.push_subscriptions $$), 1, 'a user can remove their own device');

select tests.login_anon();
select throws_ok($$ select count(*) from public.push_subscriptions $$, '42501', null, 'anon cannot read push subscriptions');

select tests.logout();
select * from finish();
rollback;
