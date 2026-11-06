-- Teacher locations: the places where a teacher may hold lessons, chosen by the administrator. A lesson or a free slot can
-- only be at one of them (the database enforces it), and a location cannot be taken away from a teacher who still has a
-- lesson or free slot there that has not ended.
begin;
select plan(76);

select tests.seed_basic();

-- The error detail of a refused statement (null when it succeeded).
create function pg_temp.detail_of(p_sql text) returns jsonb
language plpgsql as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end $$;

-- The same, for a statement the administrator runs.
create function pg_temp.admin_detail_of(p_sql text) returns jsonb
language plpgsql as $$
declare
  v_detail jsonb;
begin
  perform tests.login_as('admin');
  v_detail := pg_temp.detail_of(p_sql);
  perform tests.logout();
  return v_detail;
end $$;

-- The fixture keys of the lessons named in such a detail, sorted.
create function pg_temp.listed(p_detail jsonb) returns text[]
language sql as $$
  select coalesce(array_agg(tests.key_of((e ->> 'id')::uuid) order by tests.key_of((e ->> 'id')::uuid)), '{}')
    from jsonb_array_elements(p_detail -> 'lessons') as e
$$;

-- The administrator takes one location from a teacher, who keeps the others. Returns the lessons that stopped it,
-- or null when the location was taken away (it is then really gone: put it back with an insert).
create function pg_temp.blocked_by(p_teacher text, p_location text) returns text[]
language plpgsql as $$
declare
  v_detail jsonb;
begin
  v_detail := pg_temp.admin_detail_of(format(
    $f$ select public.set_teacher_locations(%L::uuid,
          array(select location_id from public.teacher_locations where teacher_id = %L::uuid and location_id <> %L::uuid)) $f$,
    tests.id('p:' || p_teacher), tests.id('p:' || p_teacher), tests.id('loc:' || p_location)));
  return case when v_detail is null then null else pg_temp.listed(v_detail) end;
end $$;

-- The table and who reads it -------------------------------------------------------------------------------------------------

select has_table('public', 'teacher_locations', 'the relation between teachers and locations exists');
select is(tests.locations_of('ta'), array['L1', 'L2'], 'the fixture teachers may use every location');

select tests.login_as('admin');
select is((select count(*)::int from public.teacher_locations where teacher_id = any (tests.ids('p:'))), 8, 'the administrator reads every row');
select tests.login_as('boss');
select is((select count(*)::int from public.teacher_locations where teacher_id = any (tests.ids('p:'))), 8, 'an administrator who teaches reads every row');
select tests.login_as('ta');
select is((select array_agg(distinct tests.key_of(teacher_id)) from public.teacher_locations where teacher_id = any (tests.ids('p:'))),
  array['p:ta'], 'a teacher reads only their own rows');
select tests.login_as('s1');
select is((select count(*)::int from public.teacher_locations where teacher_id = any (tests.ids('p:'))), 0, 'a student reads nothing');
select tests.login_as('p1');
select is((select count(*)::int from public.teacher_locations where teacher_id = any (tests.ids('p:'))), 0, 'a parent reads nothing');
select tests.login_as('outsider');
select is((select count(*)::int from public.teacher_locations), 0, 'a Google account without a profile reads nothing');
select tests.login_anon();
select throws_ok($$ select count(*) from public.teacher_locations $$, '42501', null, 'a signed-out visitor has no access');

-- There are no direct writes, not even for the administrator: the function below is the only way.
select tests.login_as('admin');
select throws_ok($$ insert into public.teacher_locations (teacher_id, location_id) values (tests.id('p:tc'), tests.id('loc:L1')) $$,
  '42501', null, 'nobody inserts directly');
select throws_ok($$ delete from public.teacher_locations where teacher_id = tests.id('p:tc') $$, '42501', null, 'nobody deletes directly');
select throws_ok($$ update public.teacher_locations set location_id = tests.id('loc:L2') where teacher_id = tests.id('p:tc') $$,
  '42501', null, 'nobody updates directly');
select tests.login_as('ta');
select throws_ok($$ insert into public.teacher_locations (teacher_id, location_id) values (tests.id('p:ta'), tests.id('loc:L1')) $$,
  '42501', null, 'a teacher cannot give themselves a location');
select tests.logout();

-- set_teacher_locations -----------------------------------------------------------------------------------------------------------

select tests.login_as('admin');
select lives_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L1')]) $$, 'the administrator narrows a teacher to one location');
select tests.logout();
select is(tests.locations_of('tc'), array['L1'], 'the other location is gone');
select is(tests.locations_of('ta'), array['L1', 'L2'], 'other teachers are not touched');

select tests.login_as('admin');
select lives_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L2'), tests.id('loc:L1'), tests.id('loc:L1')]) $$,
  'locations are added, and a repeated one is no problem');
select tests.logout();
select is(tests.locations_of('tc'), array['L1', 'L2'], 'the teacher has both again');

select tests.login_as('boss');
select lives_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L2')]) $$, 'an administrator who teaches may do it too');
select tests.logout();
select is(tests.locations_of('tc'), array['L2'], 'and it takes effect');
select tests.login_as('admin');
select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L1'), tests.id('loc:L2')]);

select tests.login_as('ta');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:ta'), array[tests.id('loc:L1')]) $$, 'PT403', null, 'a teacher cannot change their own locations');
select tests.login_as('tb');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L1')]) $$, 'PT403', null, 'nor a colleague''s');
select tests.login_as('s1');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L1')]) $$, 'PT403', null, 'a student cannot');
select tests.login_anon();
select throws_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L1')]) $$, '42501', null, 'a signed-out visitor cannot call it');

select tests.login_as('admin');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[]::uuid[]) $$, 'PT400',
  'a teacher needs at least one location', 'an empty list is refused');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:tc'), null) $$, 'PT400',
  'a teacher needs at least one location', 'so is no list at all');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[gen_random_uuid()]) $$, 'PT400', 'unknown location',
  'an unknown location is refused');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L1'), gen_random_uuid()]) $$, 'PT400',
  'unknown location', 'even next to a valid one');
select throws_ok($$ select public.set_teacher_locations(gen_random_uuid(), array[tests.id('loc:L1')]) $$, 'PT404', 'teacher not found',
  'an unknown teacher is refused');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:s1'), array[tests.id('loc:L1')]) $$, 'PT404', 'teacher not found',
  'a person who is not a teacher is refused');
select tests.logout();
select is(tests.locations_of('tc'), array['L1', 'L2'], 'a refused change leaves everything as it was');

-- Taking a location away while lessons are still to come ------------------------------------------------------------------------------
-- ta has lessons still to come at L1 (group, solo and a free slot), one that is over, and nothing at L2.

select tests.login_as('admin');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:ta'), array[tests.id('loc:L2')]) $$, 'PT409',
  'this teacher still has lessons or free slots at this location', 'a location with lessons to come cannot be taken away');
select tests.logout();
select is(tests.locations_of('ta'), array['L1', 'L2'], 'and nothing is changed, not even what could have been added');

create temp table detail as
  select pg_temp.admin_detail_of($$ select public.set_teacher_locations(tests.id('p:ta'), array[tests.id('loc:L2')]) $$) as d;
select is(pg_temp.listed((select d from detail)), array['les:group', 'les:slot', 'les:solo'],
  'the error lists every lesson and slot still to come, and not the one that is over');
select is((select (d ->> 'total')::int from detail), 3, 'with how many there are');
select is((select d -> 'lessons' -> 0 ->> 'location_id' from detail), tests.id('loc:L1')::text, 'and where');
select is((select jsonb_typeof(d -> 'lessons' -> 0 -> 'status') from detail), 'string', 'and whether it is a free slot, a booking or a lesson');
select ok(not (select d::text like '%s1%' or d::text like '%Prvi%' from detail), 'but never who attends');

select is(pg_temp.blocked_by('ta', 'L2'), null::text[], 'a location nobody is waiting at can be taken away, whatever colleagues have there');
insert into public.teacher_locations (teacher_id, location_id) values (tests.id('p:ta'), tests.id('loc:L2'));

-- what counts as "still to come" (ta, at L2)
select tests.mklesson('x_open', 'ta', 'math', 'L2', null, tests.at(60 * 60), 60, 'open', 'slot');
select is(pg_temp.blocked_by('ta', 'L2'), array['les:x_open'], 'a free slot blocks');
delete from public.lessons where id = tests.id('les:x_open');
select tests.mklesson('x_pend', 'ta', 'math', 'L2', null, tests.at(62 * 60), 60, 'pending', 'slot', array['s1']);
select is(pg_temp.blocked_by('ta', 'L2'), array['les:x_pend'], 'a booking that waits for an answer blocks');
delete from public.lessons where id = tests.id('les:x_pend');
select tests.mklesson('x_conf', 'ta', 'math', 'L2', 'R3', tests.at(64 * 60), 60, 'confirmed', 'teacher', array['s1']);
select is(pg_temp.blocked_by('ta', 'L2'), array['les:x_conf'], 'a confirmed lesson blocks');
delete from public.lessons where id = tests.id('les:x_conf');
select tests.mklesson('x_prog', 'tb', 'phys', 'L1', null, tests.at(-30), 60, 'confirmed', 'teacher', array['s3']);
select is(pg_temp.blocked_by('tb', 'L1'), array['les:x_prog'], 'a lesson that is going on blocks');
select tests.mklesson('x_ended', 'ta', 'math', 'L2', 'R3', tests.at(-120), 60, 'confirmed', 'teacher', array['s1']);
select tests.mklesson('x_old', 'ta', 'math', 'L2', 'R3', tests.at(-48 * 60), 60, 'confirmed', 'teacher', array['s1']);
select is(pg_temp.blocked_by('ta', 'L2'), null::text[], 'lessons that are over, today or before, never block');
insert into public.teacher_locations (teacher_id, location_id) values (tests.id('p:ta'), tests.id('loc:L2'));

-- the same rule holds without the function (the database is the last word)
select throws_ok($$ delete from public.teacher_locations where teacher_id = tests.id('p:ta') and location_id = tests.id('loc:L1') $$,
  'PT409', 'this teacher still has lessons or free slots at this location', 'a plain delete is refused as well');
select is(pg_temp.listed(pg_temp.detail_of($$ delete from public.teacher_locations where teacher_id = tests.id('p:ta') and location_id = tests.id('loc:L1') $$)),
  array['les:group', 'les:slot', 'les:solo'], 'and it names the lessons too');
select lives_ok($$ delete from public.teacher_locations where teacher_id = tests.id('p:ta') and location_id = tests.id('loc:L2') $$,
  'while a location with only past lessons can go');
insert into public.teacher_locations (teacher_id, location_id) values (tests.id('p:ta'), tests.id('loc:L2'));

-- several locations at once: the error names the lessons of all of them
insert into public.locations (name, address) values ('Test Novi Beograd', 'Ulica 3');
select tests.reg('loc:L3', (select id from public.locations where name = 'Test Novi Beograd'));
select tests.mklesson('m_l2', 'ta', 'math', 'L2', 'R3', tests.at(66 * 60), 60, 'confirmed', 'teacher', array['s1']);
select tests.login_as('admin');
select lives_ok($$ select public.set_teacher_locations(tests.id('p:ta'), array[tests.id('loc:L1'), tests.id('loc:L2'), tests.id('loc:L3')]) $$,
  'a third location is added');
select is(pg_temp.listed(pg_temp.admin_detail_of($$ select public.set_teacher_locations(tests.id('p:ta'), array[tests.id('loc:L3')]) $$)),
  array['les:group', 'les:m_l2', 'les:slot', 'les:solo'], 'taking away two locations at once names the lessons of both');
select tests.logout();
delete from public.lessons where id = tests.id('les:m_l2');

-- A teacher always keeps at least one location ----------------------------------------------------------------------------------------
-- tc has no lessons, so only this rule can stop the deletes below.

select throws_ok($$ delete from public.teacher_locations where teacher_id = tests.id('p:tc') $$, 'PT409',
  'a teacher needs at least one location', 'the last location cannot be deleted');
select lives_ok($$ delete from public.teacher_locations where teacher_id = tests.id('p:tc') and location_id = tests.id('loc:L2') $$,
  'one of two can');
update public.teachers set is_active = false where profile_id = tests.id('p:tc');
select throws_ok($$ delete from public.teacher_locations where teacher_id = tests.id('p:tc') $$, 'PT409',
  'a teacher needs at least one location', 'a deactivated teacher keeps one too, so that reactivating is safe');
update public.teachers set is_active = true where profile_id = tests.id('p:tc');
insert into public.teacher_locations (teacher_id, location_id) values (tests.id('p:tc'), tests.id('loc:L2'));

-- Deleting a location ---------------------------------------------------------------------------------------------------------------------

select tests.login_as('admin');
select is(tests.affected($$ delete from public.locations where id = tests.id('loc:L3') $$), 1,
  'a location that nobody uses for lessons or rooms can still be deleted, although teachers may use it');
select tests.logout();
select is(tests.locations_of('ta'), array['L1', 'L2'], 'and it leaves the teachers'' lists');

insert into public.locations (name, address) values ('Test Zvezdara', 'Ulica 4');
select tests.reg('loc:L4', (select id from public.locations where name = 'Test Zvezdara'));
select tests.login_as('admin');
select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L4')]);
select throws_ok($$ delete from public.locations where id = tests.id('loc:L4') $$, 'PT409', 'a teacher needs at least one location',
  'but not while it is the only location of a teacher');
select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L1'), tests.id('loc:L2'), tests.id('loc:L4')]);
select is(tests.affected($$ delete from public.locations where id = tests.id('loc:L4') $$), 1, 'once the teacher has another one it can');
select throws_ok($$ delete from public.locations where id = tests.id('loc:L1') $$, '23503', null, 'a location with lessons is still refused');
select tests.logout();

insert into public.locations (name, address) values ('Test Vracar', 'Ulica 5');
select tests.reg('loc:L5', (select id from public.locations where name = 'Test Vracar'));
insert into public.rooms (location_id, name) values (tests.id('loc:L5'), 'Test Soba');
select tests.login_as('admin');
select throws_ok($$ delete from public.locations where id = tests.id('loc:L5') $$, '23503', null, 'and so is a location with rooms');
select tests.logout();

-- Lessons and free slots ---------------------------------------------------------------------------------------------------------------
-- ta may only use L1 from here on (the lessons ta has at L2 are over).

delete from public.teacher_locations where teacher_id = tests.id('p:ta') and location_id = tests.id('loc:L2');
select is(tests.locations_of('ta'), array['L1'], 'ta is limited to L1');

select tests.login_as('ta');
select lives_ok($$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), tests.id('room:R1'),
  tests.at(200 * 60), tests.at(200 * 60 + 60), array[tests.id('s:s1')]) $$, 'a lesson at an allowed location is scheduled');
select throws_ok($$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L2'), tests.id('room:R3'),
  tests.at(210 * 60), tests.at(210 * 60 + 60), array[tests.id('s:s1')]) $$, 'PT400', 'the teacher may not hold lessons at this location',
  'a lesson at another location is refused, although a colleague may use it');
select lives_ok($$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
  values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L1'), tests.at(300 * 60), tests.at(300 * 60 + 60), 'open', 'slot') $$,
  'a free slot at an allowed location is published');
select throws_ok($$ insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
  values (tests.id('p:ta'), tests.id('subj:math'), tests.id('loc:L2'), tests.at(310 * 60), tests.at(310 * 60 + 60), 'open', 'slot') $$,
  'PT400', 'the teacher may not hold lessons at this location', 'a free slot at another location is refused');
select throws_ok($$ update public.lessons set location_id = tests.id('loc:L2'), room_id = tests.id('room:R3') where id = tests.id('les:solo') $$,
  'PT400', 'the teacher may not hold lessons at this location', 'a lesson cannot be moved to another location');
select lives_ok($$ update public.lessons set room_id = tests.id('room:R1'), start_at = start_at + interval '15 minutes', end_at = end_at + interval '15 minutes'
  where id = tests.id('les:solo') $$, 'but it can change room and time within the allowed location');
select lives_ok($$ update public.lessons set outcome = 'held' where id = tests.id('les:x_ended') $$,
  'a lesson that stays where it is can be edited after its location was taken away (its outcome is recorded)');
select tests.logout();
select throws_ok($$ select tests.mklesson('bad', 'ta', 'math', 'L2', 'R3', tests.at(220 * 60), 60, 'confirmed', 'teacher', array['s1']) $$,
  'PT400', 'the teacher may not hold lessons at this location', 'the rule holds for every writer, not only for a signed-in teacher');

select tests.login_as('tb');
select lives_ok($$ update public.lessons set location_id = tests.id('loc:L1'), room_id = tests.id('room:R1') where id = tests.id('les:tb_lesson') $$,
  'a lesson is moved to another location the teacher may use');
select tests.logout();

select tests.login_as('admin');
select public.set_teacher_locations(tests.id('p:tc'), array[tests.id('loc:L2')]);
select tests.logout();
select throws_ok($$ update public.lessons set teacher_id = tests.id('p:tc') where id = tests.id('les:solo') $$,
  'PT400', 'the teacher may not hold lessons at this location', 'a lesson cannot be handed to a teacher who may not use its location');

-- Deactivating, reactivating and erasing -------------------------------------------------------------------------------------------------

select tests.login_as('admin');
select public.deactivate_teacher(tests.id('p:tb'));
select tests.logout();
select is(tests.locations_of('tb'), array['L1', 'L2'], 'a deactivated teacher keeps the locations');
select tests.login_as('admin');
select public.reactivate_teacher(tests.id('p:tb'));
select tests.logout();
select is(tests.locations_of('tb'), array['L1', 'L2'], 'and has them when they are back');

select tests.login_as('admin');
select is(public.erase_teacher(tests.id('p:ta')), 'kept_history', 'a teacher with lessons that took place is erased and the record stays');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:ta'), array[tests.id('loc:L1')]) $$, 'PT409', 'this teacher was erased',
  'an erased record gets no locations');
select tests.logout();
select lives_ok($$ delete from public.teacher_locations where teacher_id = tests.id('p:ta') $$,
  'what is left of an erased teacher is not protected by the one-location rule');
select tests.login_as('admin');
select is(public.erase_teacher(tests.id('p:tc')), 'deleted', 'a teacher without any lesson is erased completely');
select tests.logout();
select is(tests.locations_of('tc'), array[]::text[], 'and so are their locations');

select * from finish();
rollback;
