begin;
select plan(21);

select tests.seed_basic();

-- Extra people for the combinations seed_basic does not have.
select tests.mkperson('tp', 'Test', 'NastavnikRoditelj');
insert into public.teachers (profile_id) values (tests.id('p:tp'));
insert into public.teacher_subjects (teacher_id, subject_id) values (tests.id('p:tp'), tests.id('subj:math'));
insert into public.parents (profile_id) values (tests.id('p:tp'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:tp'), tests.id('s:s2'));

-- A teacher who is deactivated keeps the profile but loses the role.
update public.teachers set is_active = false where profile_id = tests.id('p:tc');

create function pg_temp.roles_of(p_key text) returns text
language plpgsql as $$
declare
  v_row record;
  v_out text;
begin
  perform tests.login_as(p_key);
  select * into v_row from public.my_roles();
  v_out := case when v_row is null then 'none' else
    concat_ws(',',
      case when v_row.is_admin then 'admin' end,
      case when v_row.is_teacher then 'teacher' end,
      case when v_row.is_student then 'student' end,
      case when v_row.is_parent then 'parent' end,
      case when not (v_row.is_admin or v_row.is_teacher or v_row.is_student or v_row.is_parent) then 'noroles' end)
  end;
  perform tests.logout();
  return v_out;
end $$;

select is(pg_temp.roles_of('admin'), 'admin', 'admin only');
select is(pg_temp.roles_of('boss'), 'admin,teacher', 'admin and teacher');
select is(pg_temp.roles_of('ta'), 'teacher', 'teacher');
select is(pg_temp.roles_of('s1'), 'student', 'student');
select is(pg_temp.roles_of('su'), 'student', 'an unassigned student is still a student');
select is(pg_temp.roles_of('p1'), 'parent', 'parent');
select is(pg_temp.roles_of('tp'), 'teacher,parent', 'teacher and parent');
select is(pg_temp.roles_of('tc'), 'noroles', 'a deactivated teacher has a profile but no role');
select is(pg_temp.roles_of('outsider'), 'none', 'a Google account without a profile gets no row');

-- Identity: the row describes the caller, nobody else.
select tests.login_as('ta');
select is((select count(*)::int from public.my_roles()), 1, 'exactly one row');
select is((select email from public.my_roles()), 'ta@t.test', 'the row is the caller''s own profile');
select is((select profile_id from public.my_roles()), tests.id('p:ta'), 'profile id is the caller''s');
select is((select first_name || ' ' || last_name from public.my_roles()), 'Test Alfa', 'name comes from the profile');
select tests.logout();

-- A student on two teachers' lists is still one account with one set of flags.
insert into public.students (profile_id, school, grade, class_section, teacher_id)
values (tests.id('p:s1'), 'Test School', '5', 'A', tests.id('p:tb'));
select tests.login_as('s1');
select is((select count(*)::int from public.my_roles()), 1, 'two student records still give one row');
select ok((select is_student from public.my_roles()), 'and the student flag is set');
select tests.logout();

-- Changes show up at once; nothing is cached on the client's behalf.
update public.profiles set is_admin = true where id = tests.id('p:ta');
select is(pg_temp.roles_of('ta'), 'admin,teacher', 'a role granted later is visible immediately');
update public.profiles set is_admin = false where id = tests.id('p:ta');

-- The avatar is what the Google sign-in left on the profile.
update public.profiles set avatar_url = 'https://example.test/ta.png' where id = tests.id('p:ta');
select tests.login_as('ta');
select is((select avatar_url from public.my_roles()), 'https://example.test/ta.png', 'avatar is included');
select tests.logout();

-- An approved profile that never signed in belongs to nobody: no call returns it.
insert into public.profiles (email, first_name, last_name, is_admin) values ('waiting@t.test', 'Test', 'Waiting', true);
select tests.login_as('s1');
select is((select count(*)::int from public.my_roles() where email = 'waiting@t.test'), 0, 'nobody gets another person''s roles');
select tests.logout();

-- Access: signed-in only.
select tests.login_anon();
select throws_ok($$ select * from public.my_roles() $$, '42501', null, 'anon cannot call my_roles');
select tests.logout();
select function_privs_are('public', 'my_roles', array[]::text[], 'authenticated', array['EXECUTE'], 'authenticated may execute my_roles');
select function_privs_are('public', 'my_roles', array[]::text[], 'anon', array[]::text[], 'anon may not execute my_roles');

select * from finish();
rollback;
