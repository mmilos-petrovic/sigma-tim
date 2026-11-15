-- The public bucket for CV photos: a teacher writes only into their own folder, nobody lists it but the owner and the
-- admin, and anyone outside the school (or a deactivated teacher) writes nothing.
-- File type and size limits are enforced by the Storage API from the bucket settings, so they are asserted as settings.
begin;
select plan(22);

select tests.seed_basic();

-- Storage blocks any direct DELETE from SQL unless this flag is set (the Storage API sets it itself).
select set_config('storage.allow_delete_query', 'true', true);

select is(
  (select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'cv-photos'),
  row(true, 2097152::bigint, array['image/jpeg', 'image/webp'])::text,
  'the bucket is public, limited to 2 MiB and to JPEG/WebP'
);

-- a teacher writes into their own folder ------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('cv-photos', '%s/11111111-1111-1111-1111-111111111111.jpg') $$, tests.id('p:ta')),
  'a teacher uploads a photo into their own folder'
);
select lives_ok(
  format($$ update storage.objects set name = '%1$s/22222222-2222-2222-2222-222222222222.jpg' where bucket_id = 'cv-photos' and name = '%1$s/11111111-1111-1111-1111-111111111111.jpg' $$, tests.id('p:ta')),
  'and replaces it with a new file in the same folder'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('cv-photos', '%s/33333333-3333-3333-3333-333333333333.jpg') $$, tests.id('p:tb')),
  '42501', null, 'but not into a colleague''s folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('cv-photos', 'loose-file.jpg') $$,
  '42501', null, 'nor outside any folder'
);
select throws_ok(
  format($$ update storage.objects set name = '%s/44444444-4444-4444-4444-444444444444.jpg' where bucket_id = 'cv-photos' $$, tests.id('p:tb')),
  '42501', null, 'nor moves their own photo into a colleague''s folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('some-other-bucket', 'x.jpg') $$,
  '42501', null, 'the policies cover this bucket only'
);
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 1, 'the owner lists their own photo');
select tests.logout();

-- a colleague has no power over it ----------------------------------------------------------------------------------
select tests.login_as('tb');
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 0, 'a colleague lists nothing, so the files cannot be found');
select is(tests.affected($$ update storage.objects set name = 'x' where bucket_id = 'cv-photos' $$), 0, 'cannot rename it');
select is(tests.affected($$ delete from storage.objects where bucket_id = 'cv-photos' $$), 0, 'and cannot delete it');
select tests.logout();

-- members who are not teachers and strangers write nothing -------------------------------------------------------------
select tests.login_as('s1');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('cv-photos', '%s/55555555-5555-5555-5555-555555555555.jpg') $$, tests.id('p:s1')),
  '42501', null, 'a student cannot upload'
);
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 0, 'and lists nothing');
select tests.login_as('p1');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('cv-photos', '%s/55555555-5555-5555-5555-555555555555.jpg') $$, tests.id('p:p1')),
  '42501', null, 'a parent cannot upload'
);
select tests.login_as('outsider');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('cv-photos', 'anything/66666666-6666-6666-6666-666666666666.jpg') $$,
  '42501', null, 'an unknown Google account cannot upload'
);
select tests.login_anon();
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('cv-photos', 'anything/66666666-6666-6666-6666-666666666666.jpg') $$,
  '42501', null, 'anon cannot upload'
);
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 0, 'and lists nothing (a photo is reached by its address only)');
select tests.logout();

-- a teacher who is deactivated writes nothing and sees nothing --------------------------------------------------------
select tests.login_as('tc');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('cv-photos', '%s/77777777-7777-7777-7777-777777777777.jpg') $$, tests.id('p:tc')),
  'an active teacher uploads their photo'
);
select tests.logout();
update public.teachers set is_active = false where profile_id = tests.id('p:tc');
select tests.login_as('tc');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('cv-photos', '%s/88888888-8888-8888-8888-888888888888.jpg') $$, tests.id('p:tc')),
  '42501', null, 'once deactivated, the teacher cannot upload'
);
select is(tests.affected($$ delete from storage.objects where bucket_id = 'cv-photos' $$), 0, 'nor delete');
select tests.logout();

-- the administrator deletes -------------------------------------------------------------------------------------------
select tests.login_as('admin');
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 2, 'the admin lists every photo');
select is(tests.affected($$ delete from storage.objects where bucket_id = 'cv-photos' $$), 2, 'and deletes them (for a teacher who was erased)');
select tests.logout();

select * from finish();
rollback;
