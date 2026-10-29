-- Shared helpers and fixtures for the pgTAP suite.
--
-- This file is the only one that commits (the `tests` schema must outlive it so the other files can use it).
-- The fixtures themselves are inserted by each test file inside its own transaction and rolled back with it.
-- All fixture emails end in @t.test and all names are prefixed "Test", so they never collide with seed.sql.

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create table if not exists tests.ctx (
  key text primary key,
  id uuid not null
);

create or replace function tests.reg(p_key text, p_id uuid) returns uuid
language sql as $$
  insert into tests.ctx (key, id) values (p_key, p_id)
  on conflict (key) do update set id = excluded.id
  returning id
$$;

-- Looks up a registered fixture id. Security definer so it also works while the session role is anon/authenticated.
create or replace function tests.id(p_key text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from tests.ctx where key = p_key
$$;

-- All registered fixture ids whose key starts with the prefix ('p:' profiles, 's:' students, 'les:' lessons, ...).
-- Tests filter with `id = any(tests.ids('les:'))` so they stay independent of whatever seed.sql loaded.
create or replace function tests.ids(p_prefix text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from tests.ctx where key like p_prefix || '%'
$$;

-- A point in time on the 15 minute grid, p_minutes after "now" (now() is fixed for the whole transaction).
create or replace function tests.at(p_minutes int) returns timestamptz
language sql stable as $$
  select to_timestamp(ceil(extract(epoch from now()) / 900) * 900) + p_minutes * interval '1 minute'
$$;

-- 00:00 today in the school's time zone: lessons are locked by calendar day, not by the clock.
create or replace function tests.today_start() returns timestamptz
language sql stable as $$
  select ((now() at time zone 'Europe/Belgrade')::date)::timestamp at time zone 'Europe/Belgrade'
$$;

-- Session helpers: behave like a PostgREST request made by the given fixture user.
create or replace function tests.login_as(p_key text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', tests.id('u:' || p_key),
      'role', 'authenticated',
      'email', p_key || '@t.test',
      'app_metadata', jsonb_build_object('provider', 'google')
    )::text,
    true
  );
  set local role authenticated;
end $$;

create or replace function tests.login_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;

create or replace function tests.logout() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Number of rows an INSERT/UPDATE/DELETE statement touched under the current role (RLS filters silently).
create or replace function tests.affected(p_sql text) returns int
language plpgsql as $$
declare
  v_count int;
begin
  execute 'with q as (' || p_sql || ' returning 1) select count(*) from q' into v_count;
  return v_count;
end $$;

-- The fixture key of an id. Security definer so it works under any role.
create or replace function tests.key_of(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select key from tests.ctx where id = p_id order by key limit 1
$$;

-- What the current role can see of the fixture people, as sorted key lists (email local part).
create or replace function tests.profile_keys() returns text[]
language sql stable as $$
  select coalesce(array_agg(split_part(email, '@', 1) order by email), '{}')
    from public.profiles where id = any(tests.ids('p:'))
$$;

-- Deliberately no join to profiles: that table has its own policies and would hide a leak in students.
create or replace function tests.student_keys() returns text[]
language sql stable as $$
  select coalesce(array_agg(substr(tests.key_of(s.id), 3) order by tests.key_of(s.id)), '{}')
    from public.students s
   where s.id = any(tests.ids('s:'))
$$;

-- Fixture lessons the current role can see, as a sorted key list ('les:solo', ...).
create or replace function tests.lesson_keys() returns text[]
language sql stable as $$
  select coalesce(array_agg(tests.key_of(l.id) order by tests.key_of(l.id)), '{}')
    from public.lessons l where l.id = any(tests.ids('les:'))
$$;

-- Who was queued a cancellation notice for the lesson (sorted keys). Only meaningful as postgres:
-- clients never see the outbox.
create or replace function tests.notified(p_lesson_key text, p_reason text default null) returns text[]
language sql stable as $$
  select coalesce(array_agg(split_part(p.email, '@', 1) order by p.email), '{}')
    from public.notifications n join public.profiles p on p.id = n.recipient_id
   where n.kind = 'lesson_cancelled'
     and (n.payload->>'lesson_id')::uuid = tests.id('les:' || p_lesson_key)
     and (p_reason is null or n.payload->>'reason' = p_reason)
$$;

-- Who was told that a participant left a lesson that goes on (sorted keys).
create or replace function tests.notified_left(p_lesson_key text) returns text[]
language sql stable as $$
  select coalesce(array_agg(split_part(p.email, '@', 1) order by p.email), '{}')
    from public.notifications n join public.profiles p on p.id = n.recipient_id
   where n.kind = 'participant_left'
     and (n.payload->>'lesson_id')::uuid = tests.id('les:' || p_lesson_key)
$$;

-- Fixture builders (run as postgres, i.e. without RLS).
create or replace function tests.mkperson(p_key text, p_first text, p_last text, p_admin boolean default false) returns uuid
language plpgsql as $$
declare
  v_profile uuid;
  v_user uuid := gen_random_uuid();
begin
  insert into public.profiles (email, first_name, last_name, is_admin)
  values (p_key || '@t.test', p_first, p_last, p_admin)
  returning id into v_profile;

  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user, 'authenticated', 'authenticated', p_key || '@t.test', now(),
    '{"provider":"google","providers":["google"]}', '{}', now(), now()
  );

  perform tests.reg('p:' || p_key, v_profile);
  perform tests.reg('u:' || p_key, v_user);
  return v_profile;
end $$;

-- A Google account that exists in auth but has no profile ("not a member of the school").
create or replace function tests.mkoutsider(p_key text) returns uuid
language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_user, 'authenticated', 'authenticated', p_key || '@t.test', now(),
    '{"provider":"google","providers":["google"]}', '{}', now(), now()
  );
  perform tests.reg('u:' || p_key, v_user);
  return v_user;
end $$;

create or replace function tests.mkteacher(p_key text, p_first text, p_last text, p_subject_keys text[], p_admin boolean default false) returns uuid
language plpgsql as $$
declare
  v_profile uuid := tests.mkperson(p_key, p_first, p_last, p_admin);
  v_subject text;
begin
  insert into public.teachers (profile_id) values (v_profile);
  foreach v_subject in array p_subject_keys loop
    insert into public.teacher_subjects (teacher_id, subject_id) values (v_profile, tests.id('subj:' || v_subject));
  end loop;
  return v_profile;
end $$;

-- p_teacher_key null means "unassigned".
create or replace function tests.mkstudent(p_key text, p_first text, p_last text, p_teacher_key text) returns uuid
language plpgsql as $$
declare
  v_profile uuid := tests.mkperson(p_key, p_first, p_last);
  v_student uuid;
begin
  insert into public.students (profile_id, school, grade, class_section, teacher_id)
  values (v_profile, 'Test School', '5', 'A', case when p_teacher_key is null then null else tests.id('p:' || p_teacher_key) end)
  returning id into v_student;
  perform tests.reg('s:' || p_key, v_student);
  return v_student;
end $$;

create or replace function tests.mkparent(p_key text, p_first text, p_last text, p_child_keys text[]) returns uuid
language plpgsql as $$
declare
  v_profile uuid := tests.mkperson(p_key, p_first, p_last);
  v_child text;
begin
  insert into public.parents (profile_id) values (v_profile);
  foreach v_child in array p_child_keys loop
    insert into public.parent_students (parent_id, student_id) values (v_profile, tests.id('s:' || v_child));
  end loop;
  return v_profile;
end $$;

-- Registers the lesson as 'les:<key>'. Open slots get no students; every other status needs at least one.
create or replace function tests.mklesson(
  p_key text, p_teacher_key text, p_subject_key text, p_location_key text, p_room_key text,
  p_start timestamptz, p_minutes int, p_status text, p_origin text, p_student_keys text[] default '{}'
) returns uuid
language plpgsql as $$
declare
  v_lesson uuid;
  v_student text;
begin
  insert into public.lessons (teacher_id, subject_id, location_id, room_id, start_at, end_at, status, origin)
  values (
    tests.id('p:' || p_teacher_key), tests.id('subj:' || p_subject_key), tests.id('loc:' || p_location_key),
    case when p_room_key is null then null else tests.id('room:' || p_room_key) end,
    p_start, p_start + p_minutes * interval '1 minute', p_status::public.lesson_status, p_origin::public.lesson_origin
  )
  returning id into v_lesson;

  foreach v_student in array p_student_keys loop
    insert into public.lesson_students (lesson_id, student_id) values (v_lesson, tests.id('s:' || v_student));
  end loop;

  perform tests.reg('les:' || p_key, v_lesson);
  return v_lesson;
end $$;

-- The standard school used by most test files.
--
--   admin  admin only                      ta, tb, tc  teachers (tc has no students)
--   boss   admin and teacher               s1, s2 -> ta;  s3 -> tb;  sb -> boss;  su unassigned
--   p1 parent of s1 and s3 (two teachers)  p2 parent of s2;  pu parent of su
--   outsider: a Google account without a profile
create or replace function tests.seed_basic() returns void
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.subjects (name) values ('Test Matematika') returning id into v_id;
  perform tests.reg('subj:math', v_id);
  insert into public.subjects (name) values ('Test Fizika') returning id into v_id;
  perform tests.reg('subj:phys', v_id);

  insert into public.locations (name, address) values ('Test Centar', 'Ulica 1') returning id into v_id;
  perform tests.reg('loc:L1', v_id);
  insert into public.locations (name, address) values ('Test Zemun', 'Ulica 2') returning id into v_id;
  perform tests.reg('loc:L2', v_id);
  insert into public.rooms (location_id, name) values (tests.id('loc:L1'), 'Ucionica 1') returning id into v_id;
  perform tests.reg('room:R1', v_id);
  insert into public.rooms (location_id, name) values (tests.id('loc:L1'), 'Ucionica 2') returning id into v_id;
  perform tests.reg('room:R2', v_id);
  insert into public.rooms (location_id, name) values (tests.id('loc:L2'), 'Ucionica 3') returning id into v_id;
  perform tests.reg('room:R3', v_id);

  perform tests.mkperson('admin', 'Test', 'Admin', true);
  perform tests.mkteacher('boss', 'Test', 'Boss', array['math', 'phys'], true);
  perform tests.mkteacher('ta', 'Test', 'Alfa', array['math']);
  perform tests.mkteacher('tb', 'Test', 'Beta', array['phys']);
  perform tests.mkteacher('tc', 'Test', 'Gama', array['math']);

  perform tests.mkstudent('s1', 'Test', 'Prvi', 'ta');
  perform tests.mkstudent('s2', 'Test', 'Drugi', 'ta');
  perform tests.mkstudent('s3', 'Test', 'Treci', 'tb');
  perform tests.mkstudent('sb', 'Test', 'Sef', 'boss');
  perform tests.mkstudent('su', 'Test', 'Neraspodjeljen', null);

  perform tests.mkparent('p1', 'Test', 'Roditelj1', array['s1', 's3']);
  perform tests.mkparent('p2', 'Test', 'Roditelj2', array['s2']);
  perform tests.mkparent('pu', 'Test', 'RoditeljU', array['su']);

  perform tests.mkoutsider('outsider');

  perform tests.mklesson('group', 'ta', 'math', 'L1', 'R1', tests.at(30 * 60), 60, 'confirmed', 'teacher', array['s1', 's2']);
  update public.lesson_students set note = 'note-s1' where lesson_id = tests.id('les:group') and student_id = tests.id('s:s1');
  update public.lesson_students set note = 'note-s2' where lesson_id = tests.id('les:group') and student_id = tests.id('s:s2');
  perform tests.mklesson('solo', 'ta', 'math', 'L1', 'R2', tests.at(50 * 60), 60, 'confirmed', 'teacher', array['s1']);
  perform tests.mklesson('past', 'ta', 'math', 'L1', 'R1', tests.at(-48 * 60), 60, 'confirmed', 'teacher', array['s1']);
  perform tests.mklesson('slot', 'ta', 'math', 'L1', null, tests.at(40 * 60), 60, 'open', 'slot');
  perform tests.mklesson('tb_lesson', 'tb', 'phys', 'L2', 'R3', tests.at(30 * 60), 60, 'confirmed', 'teacher', array['s3']);
  perform tests.mklesson('boss_lesson', 'boss', 'math', 'L1', 'R2', tests.at(70 * 60), 60, 'confirmed', 'teacher', array['sb']);

  -- ta: public and for members; tb: members only; boss and tc: no CV
  insert into public.teacher_cv (teacher_id, about, show_public, show_members)
  values (tests.id('p:ta'), 'About Alfa', true, true) returning id into v_id;
  perform tests.reg('cv:ta', v_id);
  insert into public.cv_experience (cv_id, employer, position, period, description, sort_order)
  values (v_id, 'Test Employer', 'Teacher', '2020 - 2024', 'Taught things', 1);
  insert into public.cv_education (cv_id, institution, degree, period, sort_order)
  values (v_id, 'Test University', 'Mathematics', '2015 - 2019', 1);
  insert into public.cv_skills (cv_id, skill, sort_order) values (v_id, 'Patience', 1);

  insert into public.teacher_cv (teacher_id, about, show_public, show_members)
  values (tests.id('p:tb'), 'About Beta', false, true) returning id into v_id;
  perform tests.reg('cv:tb', v_id);
end $$;

begin;
select plan(4);

select has_schema('tests', 'tests schema exists');
select has_function('tests', 'seed_basic', array[]::text[], 'seed_basic is available');
select has_function('tests', 'login_as', array['text'], 'login_as is available');
select has_function('tests', 'at', array['integer'], 'at is available');

select * from finish();
rollback;
