-- Phone numbers. Required for teachers and parents, optional for students, any country (international form). They are
-- kept apart from the profile so that who may read one can be decided per number: the administrator reads all, a person
-- their own, a teacher those of their own students and those students' parents, a student and a parent the number of
-- their teacher, and a parent the numbers of their children. Colleagues, unassigned students and strangers read none.
begin;
select plan(132);

select tests.seed_basic();

-- Normalising ------------------------------------------------------------------------------------------------------------

select is(private.normalize_phone('+381 64 123 4567'), '+381641234567', 'spaces are removed');
select is(private.normalize_phone('+381-64-123.4567'), '+381641234567', 'so are dashes and dots');
select is(private.normalize_phone('+1 (415) 555-2671'), '+14155552671', 'and brackets, for any country');
select is(private.normalize_phone('00381641234567'), '+381641234567', 'a leading 00 is a +');
select is(private.normalize_phone('  +381641234567  '), '+381641234567', 'spaces around it do not matter');
select is(private.normalize_phone('+1234567'), '+1234567', 'seven digits are the shortest');
select is(private.normalize_phone('+123456789012345'), '+123456789012345', 'fifteen digits are the longest');
select is(private.normalize_phone('+1234567890123456'), null, 'sixteen are too many');
select is(private.normalize_phone('+123456'), null, 'six are too few');
select is(private.normalize_phone('0641234567'), null, 'a number without the country is refused');
select is(private.normalize_phone('+0641234567'), null, 'a country code does not start with 0');
select is(private.normalize_phone('+38164abc4567'), null, 'letters are refused');
select is(private.normalize_phone('+381 64 123 4567 ext 5'), null, 'so is an extension');
select is(private.normalize_phone('381641234567'), null, 'and a number with no + at all');
select is(private.normalize_phone(''), null, 'nothing is not a number');
select is(private.normalize_phone(null), null, 'and neither is null');

-- The table ------------------------------------------------------------------------------------------------------------------

select has_table('public', 'person_phones', 'numbers have a table of their own');
select throws_ok($$ insert into public.person_phones (profile_id, phone) values (tests.id('p:ta'), '0641234567') $$, '23514', null,
  'the table itself only holds numbers in international form');

select throws_ok($$ insert into public.person_phones (profile_id, phone) values (tests.id('p:ta'), '+0123456789') $$, '23514', null,
  'the table refuses a country code that starts with 0');
select throws_ok($$ insert into public.person_phones (profile_id, phone) values (tests.id('p:ta'), '+12') $$, '23514', null,
  'a number that is too short');
select throws_ok($$ insert into public.person_phones (profile_id, phone) values (tests.id('p:ta'), '+1234567890123456') $$, '23514', null,
  'one that is too long');
select throws_ok($$ insert into public.person_phones (profile_id, phone) values (tests.id('p:ta'), '+38164abc4567') $$, '23514', null,
  'and one with letters in it');

-- Everybody of the fixture school has a number, so that the matrix below shows what is hidden
insert into public.person_phones (profile_id, phone)
select tests.id('p:' || t.k), '+38160' || lpad(t.n::text, 7, '0')
  from unnest(
    array['admin', 'boss', 'ta', 'tb', 'tc', 's1', 's2', 's3', 'sb', 'su', 'p1', 'p2', 'pu'],
    array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  ) as t (k, n);

-- Who reads which number ---------------------------------------------------------------------------------------------------------

select tests.login_as('admin');
select is(tests.phones_seen(), array['p:admin', 'p:boss', 'p:p1', 'p:p2', 'p:pu', 'p:s1', 'p:s2', 'p:s3', 'p:sb', 'p:su', 'p:ta', 'p:tb', 'p:tc'],
  'the administrator reads every number');
select tests.login_as('boss');
select is(tests.phones_seen(), array['p:admin', 'p:boss', 'p:p1', 'p:p2', 'p:pu', 'p:s1', 'p:s2', 'p:s3', 'p:sb', 'p:su', 'p:ta', 'p:tb', 'p:tc'],
  'so does an administrator who teaches');
select tests.login_as('ta');
select is(tests.phones_seen(), array['p:p1', 'p:p2', 'p:s1', 'p:s2', 'p:ta'],
  'a teacher reads their own number, their students'' and those students'' parents''');
select tests.login_as('tb');
select is(tests.phones_seen(), array['p:p1', 'p:s3', 'p:tb'],
  'another teacher reads theirs, and a parent shared with the first one is read by both');
select tests.login_as('tc');
select is(tests.phones_seen(), array['p:tc'], 'a teacher without students reads only their own');
select tests.login_as('s1');
select is(tests.phones_seen(), array['p:s1', 'p:ta'], 'a student reads their own number and their teacher''s');
select tests.login_as('s3');
select is(tests.phones_seen(), array['p:s3', 'p:tb'], 'also with another teacher');
select tests.login_as('sb');
select is(tests.phones_seen(), array['p:boss', 'p:sb'], 'the student of an administrator who teaches reads that teacher''s number');
select tests.login_as('su');
select is(tests.phones_seen(), array['p:su'], 'an unassigned student reads only their own');
select tests.login_as('p1');
select is(tests.phones_seen(), array['p:p1', 'p:s1', 'p:s3', 'p:ta', 'p:tb'],
  'a parent reads their own number, their children''s and their children''s teachers''');
select tests.login_as('p2');
select is(tests.phones_seen(), array['p:p2', 'p:s2', 'p:ta'], 'another parent likewise');
select tests.login_as('pu');
select is(tests.phones_seen(), array['p:pu', 'p:su'], 'a parent of an unassigned student reads the child''s number, and has no teacher to read');
select tests.login_as('outsider');
select is(tests.phones_seen(), array[]::text[], 'a Google account without a profile reads nothing');
select tests.login_anon();
select throws_ok($$ select count(*) from public.person_phones $$, '42501', null, 'a signed-out visitor has no access');
select tests.logout();

update public.teachers set is_active = false where profile_id = tests.id('p:ta');
select tests.login_as('ta');
select is(tests.phones_seen(), array['p:ta'], 'a deactivated teacher reads only their own, like any other person');
select tests.logout();
update public.teachers set is_active = true where profile_id = tests.id('p:ta');

-- No direct writes -------------------------------------------------------------------------------------------------------------------

select tests.login_as('admin');
select throws_ok($$ insert into public.person_phones (profile_id, phone) values (tests.id('p:outsider'), '+381641234567') $$, '42501', null,
  'nobody inserts directly, not even the administrator');
select throws_ok($$ update public.person_phones set phone = '+381641234567' where profile_id = tests.id('p:ta') $$, '42501', null,
  'nobody updates directly');
select throws_ok($$ delete from public.person_phones where profile_id = tests.id('p:ta') $$, '42501', null, 'nobody deletes directly');
select tests.login_as('ta');
select throws_ok($$ update public.person_phones set phone = '+381641234567' where profile_id = tests.id('p:ta') $$, '42501', null,
  'a teacher cannot change even their own number this way');
select tests.logout();

-- set_person_phone: who may set whose number -----------------------------------------------------------------------------------------

select tests.login_as('ta');
select lives_ok($$ select public.set_person_phone(tests.id('p:ta'), ' 00381 64 555 0001 ') $$, 'a teacher sets their own number');
select lives_ok($$ select public.set_person_phone(tests.id('p:s1'), '+381 64 555 0002') $$, 'and the number of a student of theirs');
select lives_ok($$ select public.set_person_phone(tests.id('p:p1'), '+381 64 555 0003') $$, 'and of a parent of such a student');
select lives_ok($$ select public.set_person_phone(tests.id('p:p2'), '+381 64 555 0004') $$, 'also a parent whose only child is theirs');
select throws_ok($$ select public.set_person_phone(tests.id('p:s3'), '+381645550005') $$, 'PT403', null, 'but not a student of a colleague');
select throws_ok($$ select public.set_person_phone(tests.id('p:tb'), '+381645550005') $$, 'PT403', null, 'nor a colleague');
select throws_ok($$ select public.set_person_phone(tests.id('p:su'), '+381645550005') $$, 'PT403', null, 'nor an unassigned student');
select throws_ok($$ select public.set_person_phone(tests.id('p:pu'), '+381645550005') $$, 'PT403', null, 'nor the parent of one');
select throws_ok($$ select public.set_person_phone(tests.id('p:admin'), '+381645550005') $$, 'PT403', null, 'nor the administrator');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '0645550001') $$, 'PT400', 'invalid phone number', 'a number without the country is refused');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), 'abc') $$, 'PT400', 'invalid phone number', 'so is text');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '+12') $$, 'PT400', 'invalid phone number', 'and a short number');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:ta')), '+381645550001', 'the teacher''s number is stored in the normal form');
select is((select phone from public.person_phones where profile_id = tests.id('p:s1')), '+381645550002', 'and so is the student''s');
select is((select phone from public.person_phones where profile_id = tests.id('p:p1')), '+381645550003', 'and the parent''s');
select is((select phone from public.person_phones where profile_id = tests.id('p:s3')), '+381600000008', 'a refused change leaves the number as it was');

select tests.login_as('tb');
select lives_ok($$ select public.set_person_phone(tests.id('p:p1'), '+381 64 555 0006') $$, 'a parent shared by two teachers is changed by either');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:p1')), '+381645550006', 'and it is one number for both');

select tests.login_as('s1');
select lives_ok($$ select public.set_person_phone(tests.id('p:s1'), '+381 64 555 0007') $$, 'a student sets their own number');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '+381645550008') $$, 'PT403', null, 'but not their teacher''s');
select throws_ok($$ select public.set_person_phone(tests.id('p:p1'), '+381645550008') $$, 'PT403', null, 'nor their parent''s');
select tests.login_as('p1');
select lives_ok($$ select public.set_person_phone(tests.id('p:p1'), '+381 64 555 0009') $$, 'a parent sets their own number');
select throws_ok($$ select public.set_person_phone(tests.id('p:s1'), '+381645550008') $$, 'PT403', null, 'but not their child''s');
select tests.login_as('outsider');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '+381645550008') $$, 'PT403', null, 'a Google account without a profile cannot');
select tests.login_anon();
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '+381645550008') $$, '42501', null, 'a signed-out visitor cannot call it');
select tests.login_as('admin');
select lives_ok($$ select public.set_person_phone(tests.id('p:tb'), '+381 64 555 0010') $$, 'the administrator sets anybody''s number');
select lives_ok($$ select public.set_person_phone(tests.id('p:su'), '+381 64 555 0011') $$, 'also an unassigned student''s');
select throws_ok($$ select public.set_person_phone(gen_random_uuid(), '+381645550008') $$, 'PT404', 'person not found', 'a person who does not exist is refused');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:s1')), '+381645550007', 'the student''s own change took effect');
select is((select phone from public.person_phones where profile_id = tests.id('p:p1')), '+381645550009', 'and the parent''s');
select is((select phone from public.person_phones where profile_id = tests.id('p:tb')), '+381645550010', 'and the administrator''s');

-- A person who had no number gets one -----------------------------------------------------------------------------------------------------

select tests.mkperson('np', 'Test', 'NoPhone');
insert into public.students (profile_id, teacher_id) values (tests.id('p:np'), tests.id('p:ta'));
select tests.login_as('ta');
select lives_ok($$ select public.set_person_phone(tests.id('p:np'), '+381 64 555 0012') $$, 'a student without a number gets one');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:np')), '+381645550012', 'and it is stored');

-- Taking a number away: only from people who need none -----------------------------------------------------------------------------------------

select tests.login_as('s1');
select lives_ok($$ select public.set_person_phone(tests.id('p:s1'), '') $$, 'a student takes their number away with an empty one');
select tests.logout();
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:s1')), 0, 'and it is gone');
select tests.login_as('s1');
select lives_ok($$ select public.set_person_phone(tests.id('p:s1'), null) $$, 'taking away what is not there is no problem');
select tests.login_as('ta');
select lives_ok($$ select public.set_person_phone(tests.id('p:s2'), '   ') $$, 'a teacher removes a student''s number, spaces count as empty');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '') $$, 'PT409', 'a teacher or parent needs a phone number', 'but not their own');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), null) $$, 'PT409', 'a teacher or parent needs a phone number', 'not even with null');
select throws_ok($$ select public.set_person_phone(tests.id('p:p2'), '') $$, 'PT409', 'a teacher or parent needs a phone number', 'nor a parent''s');
select tests.login_as('p1');
select throws_ok($$ select public.set_person_phone(tests.id('p:p1'), '') $$, 'PT409', 'a teacher or parent needs a phone number', 'a parent cannot remove their own');
select tests.login_as('boss');
select throws_ok($$ select public.set_person_phone(tests.id('p:boss'), '') $$, 'PT409', 'a teacher or parent needs a phone number', 'nor an administrator who teaches');
select tests.logout();
update public.teachers set is_active = false where profile_id = tests.id('p:tc');
select tests.login_as('admin');
select throws_ok($$ select public.set_person_phone(tests.id('p:tc'), '') $$, 'PT409', 'a teacher or parent needs a phone number', 'nor a deactivated teacher, who can come back');
select lives_ok($$ select public.set_person_phone(tests.id('p:admin'), '') $$, 'an administrator who does not teach needs none');
select tests.logout();
update public.teachers set is_active = true where profile_id = tests.id('p:tc');
select is(
  (select array_agg(tests.key_of(profile_id) order by tests.key_of(profile_id)) from public.person_phones
    where profile_id = any (array[tests.id('p:s2'), tests.id('p:ta'), tests.id('p:p2'), tests.id('p:p1'), tests.id('p:boss'), tests.id('p:tc'), tests.id('p:admin')])),
  array['p:boss', 'p:p1', 'p:p2', 'p:ta', 'p:tc'], 'in the end only the people who needed none lost theirs');

-- create_teacher -------------------------------------------------------------------------------------------------------------------------------

select tests.login_as('admin');
select lives_ok($$ select public.create_teacher('ph.t@t.test', 'Fon', 'Nastavnik', array[tests.id('subj:math')], array[tests.id('loc:L1')], '00 381 60 111 2223') $$,
  'a teacher is added with a number');
select tests.logout();
select is((select pp.phone from public.person_phones pp join public.profiles p on p.id = pp.profile_id where p.email = 'ph.t@t.test'), '+381601112223',
  'in the normal form');

select tests.login_as('admin');
select throws_ok($$ select public.create_teacher('ph.n@t.test', 'Bez', 'Broja', array[tests.id('subj:math')], array[tests.id('loc:L1')], null) $$, 'PT400',
  'a teacher needs a phone number', 'a teacher needs a number');
select throws_ok($$ select public.create_teacher('ph.n@t.test', 'Bez', 'Broja', array[tests.id('subj:math')], array[tests.id('loc:L1')], '  ') $$, 'PT400',
  'a teacher needs a phone number', 'an empty one is no number');
select throws_ok($$ select public.create_teacher('ph.n@t.test', 'Bez', 'Broja', array[tests.id('subj:math')], array[tests.id('loc:L1')], '064 123') $$, 'PT400',
  'invalid phone number', 'a number that is not one is refused');
select is((select count(*)::int from public.profiles where email = 'ph.n@t.test'), 0, 'and nobody is left behind');

-- a person who is already someone keeps the number they have, and gets one when they have none
select lives_ok($$ select public.create_teacher('p2@t.test', 'X', 'Y', array[tests.id('subj:phys')], array[tests.id('loc:L1')], '+381 69 999 9999') $$,
  'a parent can become a teacher');
select tests.logout();
select tests.mkperson('np2', 'Test', 'NoPhone2');
select tests.login_as('admin');
select lives_ok($$ select public.create_teacher('np2@t.test', 'X', 'Y', array[tests.id('subj:phys')], array[tests.id('loc:L1')], '+381 69 888 8888') $$,
  'and so can a person with no number');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:p2')), '+381645550004', 'the number they already had is not replaced');
select is((select phone from public.person_phones where profile_id = tests.id('p:np2')), '+381698888888', 'a person with none gets the one given');

select has_function('public', 'create_teacher', array['text', 'text', 'text', 'uuid[]', 'uuid[]', 'text'], 'create_teacher takes a number');
select hasnt_function('public', 'create_teacher', array['text', 'text', 'text', 'uuid[]', 'uuid[]'], 'and there is no way to add a teacher without one');

-- add_parent_to_student ---------------------------------------------------------------------------------------------------------------------------

select tests.login_as('ta');
select lives_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'ph.p@t.test', 'Fon', 'Roditelj', '+381 63 111 2224') $$, 'a parent is added with a number');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s2'), 'ph.q@t.test', 'Bez', 'Broja', null) $$, 'PT400',
  'a parent needs a phone number', 'a parent needs a number');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s2'), 'ph.q@t.test', 'Bez', 'Broja', '') $$, 'PT400',
  'a parent needs a phone number', 'an empty one is no number');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s2'), 'ph.q@t.test', 'Bez', 'Broja', '12345') $$, 'PT400',
  'invalid phone number', 'a number that is not one is refused');
-- who asks is checked before what is asked: somebody who may not add a parent is told so, not that the number is missing
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s3'), 'ph.r@t.test', 'Bez', 'Broja', null) $$, 'PT403', 'not allowed',
  'a teacher of another student is refused first, with or without a number');
select tests.login_as('s1');
select throws_ok($$ select public.add_parent_to_student(tests.id('s:s1'), 'ph.r@t.test', 'Bez', 'Broja', '') $$, 'PT403', 'not allowed',
  'so is a student');
select tests.logout();
select is((select pp.phone from public.person_phones pp join public.profiles p on p.id = pp.profile_id where p.email = 'ph.p@t.test'), '+381631112224',
  'the parent''s number is stored in the normal form');
select is((select count(*)::int from public.profiles where email = 'ph.q@t.test'), 0, 'and a refused parent leaves nobody behind');

select tests.login_as('ta');
select lives_ok($$ select public.add_parent_to_student(tests.id('s:s2'), 'p1@t.test', 'Whoever', 'Else', '+381 63 777 7777') $$,
  'a parent who is already known is linked to another child');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:p1')), '+381645550009', 'and keeps the number they have, like their name');

select tests.mkperson('np3', 'Test', 'NoPhone3');
select tests.login_as('admin');
select lives_ok($$ select public.add_parent_to_student(tests.id('s:su'), 'np3@t.test', 'X', 'Y', '+381 63 666 6666') $$, 'a known person with no number is added as a parent');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:np3')), '+381636666666', 'and gets the number given');

select has_function('public', 'add_parent_to_student', array['uuid', 'text', 'text', 'text', 'text'], 'add_parent_to_student takes a number');
select hasnt_function('public', 'add_parent_to_student', array['uuid', 'text', 'text', 'text'], 'and there is no way to add a parent without one');

-- add_student ---------------------------------------------------------------------------------------------------------------------------------------

select tests.login_as('ta');
select lives_ok($$ select public.add_student('ph.s@t.test', 'Fon', 'Ucenik', null, null, null, null, '+381 62 111 2225') $$, 'a student is added with a number');
select lives_ok($$ select public.add_student('ph.u@t.test', 'Bez', 'Ucenik') $$, 'a student is added without one');
select lives_ok($$ select public.add_student('ph.v@t.test', 'Prazan', 'Ucenik', null, null, null, null, '   ') $$, 'an empty number counts as none');
select throws_ok($$ select public.add_student('ph.w@t.test', 'Los', 'Ucenik', null, null, null, null, '12345') $$, 'PT400', 'invalid phone number',
  'a number that is not one is refused although it is optional');
select tests.logout();
select is((select pp.phone from public.person_phones pp join public.profiles p on p.id = pp.profile_id where p.email = 'ph.s@t.test'), '+381621112225',
  'the student''s number is stored in the normal form');
select is((select count(*)::int from public.person_phones pp join public.profiles p on p.id = pp.profile_id where p.email in ('ph.u@t.test', 'ph.v@t.test')), 0,
  'a student without a number has no row');
select is((select count(*)::int from public.profiles where email = 'ph.w@t.test'), 0, 'and a refused student leaves nobody behind');

select tests.login_as('tb');
select lives_ok($$ select public.add_student('p1@t.test', 'Whoever', 'Else', null, null, null, null, '+381 62 555 5555') $$,
  'a person who is known (here a parent) is added as a student too');
select tests.logout();
select is((select phone from public.person_phones where profile_id = tests.id('p:p1')), '+381645550009', 'and keeps the number they have');

-- The old function that took no number is not left behind next to the new one
select hasnt_function('public', 'add_student', array['text', 'text', 'text', 'text', 'text', 'text', 'uuid'], 'one add_student only');

-- Erasing -------------------------------------------------------------------------------------------------------------------------------------------

select tests.login_as('admin');
select is(public.erase_teacher(tests.id('p:ta')), 'kept_history', 'a teacher with lessons that took place is erased and the record stays');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '+381645550008') $$, 'PT409', 'this person was erased', 'an erased record gets no number');
select throws_ok($$ select public.set_person_phone(tests.id('p:ta'), '') $$, 'PT409', 'this person was erased', 'and none is taken from it either');
select is(public.erase_teacher(tests.id('p:tc')), 'deleted', 'a teacher without any lesson is erased completely');
select tests.logout();
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:ta')), 0, 'the number of an erased record is gone, although the record stays');
select is((select count(*)::int from public.profiles where id = tests.id('p:ta')), 1, 'and the record is still there');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:tc')), 0, 'the number of a profile that is deleted goes with it');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:s2')), 0, 'other people''s numbers are not touched (s2 had none left)');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:tb')), 1, 'a colleague''s number stays');

-- Only erasing clears it: touching erased_at without erasing does not
update public.profiles set erased_at = null where id = tests.id('p:tb');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:tb')), 1, 'clearing the erased mark of somebody who was not erased changes nothing');

select * from finish();
rollback;
