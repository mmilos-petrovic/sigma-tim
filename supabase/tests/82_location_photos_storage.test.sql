-- The private bucket for location photos: the admin writes, approved members read, nobody else sees anything.
-- File type and size limits are enforced by the Storage API from the bucket settings, so they are asserted as settings.
begin;
select plan(17);

select tests.seed_basic();

-- Storage blocks any direct DELETE from SQL unless this flag is set (the Storage API sets it itself).
select set_config('storage.allow_delete_query', 'true', true);

select is(
  (select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'location-photos'),
  row(false, 2097152::bigint, array['image/jpeg', 'image/webp'])::text,
  'the bucket is private, limited to 2 MiB and to JPEG/WebP'
);

-- the admin ---------------------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('location-photos', 'a-location/1.jpg') $$,
  'the admin uploads a photo'
);
select lives_ok(
  $$ update storage.objects set name = 'a-location/2.jpg' where bucket_id = 'location-photos' and name = 'a-location/1.jpg' $$,
  'and replaces or renames it'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('some-other-bucket', 'x.jpg') $$,
  '42501', null, 'the policies cover this bucket only'
);
select tests.logout();

-- who may not write --------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('location-photos', 'a-location/hacked.jpg') $$,
  '42501', null, 'a teacher cannot upload'
);
select is(tests.affected($$ update storage.objects set name = 'x' where bucket_id = 'location-photos' $$), 0, 'nor rename');
select is(tests.affected($$ delete from storage.objects where bucket_id = 'location-photos' $$), 0, 'nor delete');
select tests.login_as('s1');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('location-photos', 'a-location/hacked.jpg') $$,
  '42501', null, 'a student cannot upload'
);
select tests.login_as('p1');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('location-photos', 'a-location/hacked.jpg') $$,
  '42501', null, 'a parent cannot upload'
);
select tests.login_as('outsider');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('location-photos', 'a-location/hacked.jpg') $$,
  '42501', null, 'an unknown Google account cannot upload'
);
select tests.logout();

-- who may read -----------------------------------------------------------------------------------------------
select tests.login_as('s1');
select is((select count(*)::int from storage.objects where bucket_id = 'location-photos'), 1, 'a student reads the photos');
select tests.login_as('p1');
select is((select count(*)::int from storage.objects where bucket_id = 'location-photos'), 1, 'a parent too');
select tests.login_as('tb');
select is((select count(*)::int from storage.objects where bucket_id = 'location-photos'), 1, 'and any teacher');
select tests.login_as('outsider');
select is((select count(*)::int from storage.objects where bucket_id = 'location-photos'), 0, 'an unknown Google account sees nothing');
select tests.login_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'location-photos'), 0, 'anon sees nothing');
select tests.logout();

-- a teacher who is deactivated is no longer a member
update public.teachers set is_active = false where profile_id = tests.id('p:tc');
select tests.login_as('tc');
select is((select count(*)::int from storage.objects where bucket_id = 'location-photos'), 0, 'a deactivated teacher sees nothing');
select tests.logout();

-- delete ------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select is(tests.affected($$ delete from storage.objects where bucket_id = 'location-photos' $$), 1, 'the admin deletes a photo');
select tests.logout();

select * from finish();
rollback;
