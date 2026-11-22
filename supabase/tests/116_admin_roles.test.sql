-- The main administrator makes a teacher an administrator and takes that away again; an administrator has every ability except
-- those two, and the account of an administrator is protected from the other administrators.
begin;
select plan(85);

select tests.seed_basic();

create function pg_temp.roles_of(p_key text) returns text
language plpgsql as $$
declare
  v_row record;
begin
  perform tests.login_as(p_key);
  select * into v_row from public.my_roles();
  perform tests.logout();
  return case when v_row is null then 'none' else
    concat_ws(',',
      case when v_row.is_main_admin then 'main' end,
      case when v_row.is_admin then 'admin' end,
      case when v_row.is_teacher then 'teacher' end,
      case when v_row.is_student then 'student' end,
      case when v_row.is_parent then 'parent' end)
  end;
end $$;

-- who is who: admin is the main administrator, boss an ordinary administrator who also teaches ------------------------------------
select is(pg_temp.roles_of('admin'), 'main,admin', 'the main administrator says so');
select is(pg_temp.roles_of('boss'), 'admin,teacher', 'another administrator is not the main one');
select is(pg_temp.roles_of('ta'), 'teacher', 'a teacher is nothing more');
select is((select count(*)::int from public.profiles where is_main_admin), 1, 'there is one main administrator');

-- nobody can set the flags from the app --------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ update public.profiles set is_admin = true where id = tests.id('p:ta') $$, '42501', null, 'a teacher cannot make themselves an administrator');
select throws_ok($$ update public.profiles set is_main_admin = true where id = tests.id('p:ta') $$, '42501', null, 'nor the main one');
select tests.login_as('boss');
select throws_ok($$ update public.profiles set is_main_admin = true where id = tests.id('p:boss') $$, '42501', null, 'an administrator cannot make themselves the main one');
select tests.logout();
select throws_ok($$ update public.profiles set is_main_admin = true where id = tests.id('p:boss') $$, '23505', null, 'a second main administrator is impossible');
select throws_ok($$ update public.profiles set is_main_admin = true where id = tests.id('p:ta') $$, '23514', null, 'and a main administrator must be an administrator');
select ok(not has_function_privilege('anon', 'private.is_main_admin()', 'execute'), 'anon cannot ask who the main administrator is');
select ok(not has_function_privilege('anon', 'private.admin_account_is_off_limits(uuid)', 'execute'), 'nor which accounts are administrators');

-- grant_admin: who may, and what is refused ---------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.grant_admin(tests.id('p:tb')) $$, 'PT403', null, 'a teacher cannot make an administrator');
select tests.login_as('s1');
select throws_ok($$ select public.grant_admin(tests.id('p:ta')) $$, 'PT403', null, 'a student cannot');
select tests.login_as('p1');
select throws_ok($$ select public.grant_admin(tests.id('p:ta')) $$, 'PT403', null, 'a parent cannot');
select tests.login_as('outsider');
select throws_ok($$ select public.grant_admin(tests.id('p:ta')) $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select public.grant_admin(tests.id('p:ta')) $$, '42501', null, 'anon cannot');
select throws_ok($$ select public.revoke_admin(tests.id('p:ta')) $$, '42501', null, 'anon cannot take the role away either');
select tests.login_as('boss');
select throws_ok($$ select public.grant_admin(tests.id('p:ta')) $$, 'PT403', null, 'an ordinary administrator cannot either');
select throws_ok($$ select public.revoke_admin(tests.id('p:boss')) $$, 'PT403', null, 'nor take the role away, not even their own');

select tests.login_as('admin');
select throws_ok($$ select public.grant_admin(gen_random_uuid()) $$, 'PT404', 'teacher not found', 'an unknown person');
select throws_ok($$ select public.grant_admin(tests.id('p:s1')) $$, 'PT404', 'teacher not found', 'somebody who is not a teacher');
select throws_ok($$ select public.grant_admin(tests.id('p:boss')) $$, 'PT409', 'this person is already an administrator', 'somebody who is one already');
select throws_ok($$ select public.grant_admin(tests.id('p:admin')) $$, 'PT404', 'teacher not found', 'the main administrator is not a teacher here');
select lives_ok($$ select public.deactivate_teacher(tests.id('p:tc')) $$, 'setup: tc is deactivated');
select throws_ok($$ select public.grant_admin(tests.id('p:tc')) $$, 'PT409', 'only an active teacher can become an administrator', 'a deactivated teacher');
select tests.logout();
select tests.mkteacher('te', 'Test', 'Epsilon', array['math']);
select tests.mkstudent('sz', 'Test', 'Zeta', 'te');
select tests.mklesson('te_started', 'te', 'math', 'L1', null, tests.at(-15), 60, 'confirmed', 'teacher', array['sz']);
select tests.login_as('admin');
select is(public.erase_teacher(tests.id('p:te')), 'kept_history', 'setup: te is erased and kept as a record');
select throws_ok($$ select public.grant_admin(tests.id('p:te')) $$, 'PT409', 'this person was erased', 'an erased teacher');
select tests.logout();
select is((select count(*)::int from public.profiles where is_admin and id = any (array[tests.id('p:ta'), tests.id('p:tb'), tests.id('p:tc'), tests.id('p:te')])), 0,
  'the refusals made nobody an administrator');

-- grant_admin works ------------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.grant_admin(tests.id('p:ta')) $$, 'the main administrator makes a teacher an administrator');
select tests.logout();
select is(pg_temp.roles_of('ta'), 'admin,teacher', 'ta is an administrator and still a teacher');
select ok((select not is_main_admin from public.profiles where id = tests.id('p:ta')), 'but not the main one');
select is((select count(*)::int from public.profiles where is_main_admin), 1, 'there is still one main administrator');

-- the new administrator can do what an administrator does ----------------------------------------------------------------------------
select tests.login_as('ta');
select lives_ok($$ select * from public.admin_list_parents() $$, 'ta sees the list of parents');
select lives_ok($$ select * from public.admin_list_students() $$, 'and of students');
select lives_ok($$ select * from public.admin_notification_health() $$, 'and the state of the notices');
select lives_ok($$ select public.change_profile_email(tests.id('p:tb'), 'tb.new@t.test') $$, 'ta changes the email of an ordinary teacher');
select lives_ok($$ select public.set_person_phone(tests.id('p:tb'), '+381601234567') $$, 'and the phone number');
select lives_ok($$ select public.set_teacher_locations(tests.id('p:tb'), array[tests.id('loc:L1'), tests.id('loc:L2')]) $$, 'and the locations');
select lives_ok($$ insert into public.teacher_subjects (teacher_id, subject_id) values (tests.id('p:tb'), tests.id('subj:math')) $$, 'and the subjects');
select is(tests.affected($$ delete from public.teacher_subjects where teacher_id = tests.id('p:tb') and subject_id = tests.id('subj:math') $$), 1, 'also takes a subject away');
select lives_ok($$ select public.deactivate_teacher(tests.id('p:tb')) $$, 'ta deactivates an ordinary teacher');
select lives_ok($$ select public.reactivate_teacher(tests.id('p:tb')) $$, 'and brings them back');
select lives_ok($$ select public.set_person_phone(tests.id('p:ta'), '+381601234568') $$, 'ta changes their own number');
select lives_ok($$ select public.set_teacher_locations(tests.id('p:ta'), array[tests.id('loc:L1')]) $$, 'and their own locations');
select lives_ok($$ select public.create_teacher('new.teacher@t.test', 'Test', 'Novi', array[tests.id('subj:math')], array[tests.id('loc:L1')], '+381601234569') $$, 'ta adds a teacher');

-- ... but not the two things that are the main administrator's -----------------------------------------------------------------------
select throws_ok($$ select public.grant_admin(tests.id('p:tb')) $$, 'PT403', null, 'ta cannot make another administrator');
select throws_ok($$ select public.revoke_admin(tests.id('p:boss')) $$, 'PT403', null, 'nor take the role from one');
select throws_ok($$ select public.revoke_admin(tests.id('p:ta')) $$, 'PT403', null, 'not even from themselves');

-- ... and cannot touch the account of another administrator --------------------------------------------------------------------------
select throws_ok($$ select public.change_profile_email(tests.id('p:boss'), 'boss.new@t.test') $$, 'PT403', null, 'the email of an administrator who teaches');
select throws_ok($$ select public.change_profile_email(tests.id('p:admin'), 'admin.new@t.test') $$, 'PT403', null, 'the email of the main administrator');
select throws_ok($$ select public.set_person_phone(tests.id('p:boss'), '+381601234570') $$, 'PT403', null, 'the number of another administrator');
select throws_ok($$ select public.set_person_phone(tests.id('p:admin'), '+381601234570') $$, 'PT403', null, 'the number of the main administrator');
select throws_ok($$ select public.deactivate_teacher(tests.id('p:boss')) $$, 'PT403', null, 'whether another administrator teaches');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:boss')) $$, 'PT403', null, 'or comes back');
select throws_ok($$ select public.set_teacher_locations(tests.id('p:boss'), array[tests.id('loc:L1')]) $$, 'PT403', null, 'their locations');
select throws_ok($$ insert into public.teacher_subjects (teacher_id, subject_id) values (tests.id('p:boss'), tests.id('subj:phys')) $$, '42501', null, 'their subjects: none can be added');
select is(tests.affected($$ delete from public.teacher_subjects where teacher_id = tests.id('p:boss') $$), 0, 'or taken away');
select throws_ok($$ select public.erase_teacher(tests.id('p:boss')) $$, 'PT409', null, 'an administrator is never erased');
select throws_ok($$ select public.erase_person(tests.id('p:boss')) $$, 'PT409', null, 'nor as a person');
select tests.logout();
select is((select email from public.profiles where id = tests.id('p:boss')), 'boss@t.test', 'the email of boss is what it was');
select is((select is_active from public.teachers where profile_id = tests.id('p:boss')), true, 'boss still teaches');
select is((select count(*)::int from public.teacher_subjects where teacher_id = tests.id('p:boss')), 2, 'with both subjects');
select is((select count(*)::int from public.teacher_locations where teacher_id = tests.id('p:boss')), 2, 'and both locations');

-- the main administrator can do all of it for another administrator ----------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.set_person_phone(tests.id('p:boss'), '+381601234571') $$, 'the main administrator changes the number of another administrator');
select lives_ok($$ select public.set_teacher_locations(tests.id('p:boss'), array[tests.id('loc:L1')]) $$, 'and their locations');
select lives_ok($$ select public.deactivate_teacher(tests.id('p:boss')) $$, 'and deactivates them');
select lives_ok($$ select public.reactivate_teacher(tests.id('p:boss')) $$, 'and brings them back');
select lives_ok($$ select public.change_profile_email(tests.id('p:boss'), 'boss.new@t.test') $$, 'and changes their email');
select tests.logout();
select is((select email from public.profiles where id = tests.id('p:boss')), 'boss.new@t.test', 'which took effect');

-- revoke_admin ----------------------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select throws_ok($$ select public.revoke_admin(gen_random_uuid()) $$, 'PT404', 'person not found', 'an unknown person');
select throws_ok($$ select public.revoke_admin(tests.id('p:admin')) $$, 'PT409', 'the main administrator cannot be removed', 'the main administrator, even by themselves');
select throws_ok($$ select public.revoke_admin(tests.id('p:tb')) $$, 'PT409', 'this person is not an administrator', 'somebody who is not an administrator');
select lives_ok($$ select public.revoke_admin(tests.id('p:ta')) $$, 'the main administrator takes the role from ta');
select tests.logout();
select is(pg_temp.roles_of('ta'), 'teacher', 'ta is a teacher again');
select tests.login_as('ta');
select throws_ok($$ select * from public.admin_list_parents() $$, 'PT403', null, 'and sees nothing of the administration');
select throws_ok($$ select public.deactivate_teacher(tests.id('p:tb')) $$, 'PT403', null, 'and does none of it');
select tests.logout();
select is((select is_main_admin from public.profiles where id = tests.id('p:admin')), true, 'the main administrator is still the main one');
select is((select is_admin and not is_main_admin from public.profiles where id = tests.id('p:boss')), true, 'boss is still an administrator, the others did not change');

-- a demoted administrator is an ordinary person again ------------------------------------------------------------------------------
select tests.login_as('admin');
select throws_ok($$ select public.erase_teacher(tests.id('p:boss')) $$, 'PT409', null, 'an administrator is refused until the role is taken away');
select lives_ok($$ select public.revoke_admin(tests.id('p:boss')) $$, 'so it is taken away from boss');
select tests.logout();
select tests.login_as('ta');
select throws_ok($$ select public.grant_admin(tests.id('p:boss')) $$, 'PT403', null, 'ta (an ordinary teacher again) cannot grant');
select lives_ok($$ select 1 $$, 'ta is a plain teacher');
select tests.logout();
select tests.login_as('admin');
select lives_ok($$ select public.grant_admin(tests.id('p:boss')) $$, 'the role can be given again');
select lives_ok($$ select public.revoke_admin(tests.id('p:boss')) $$, 'and taken away again');
select is(public.erase_teacher(tests.id('p:boss')), 'deleted', 'a former administrator can be erased like any teacher');
select tests.logout();

select * from finish();
rollback;
