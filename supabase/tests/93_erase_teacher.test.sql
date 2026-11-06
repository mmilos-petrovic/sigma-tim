-- The administrator erases a teacher's whole profile (teacher, student and parent roles), keeping every lesson that
-- already started so it stays on record.
begin;
select plan(80);

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
      case when v_row.is_admin then 'admin' end,
      case when v_row.is_teacher then 'teacher' end,
      case when v_row.is_student then 'student' end,
      case when v_row.is_parent then 'parent' end)
  end;
end $$;

-- ta: teacher with a past lesson (history), a CV, a device, a notice and a pending takeover request ---------------------------
update public.teachers set bio = 'Bio Alfa', photo_path = 'alfa.jpg' where profile_id = tests.id('p:ta');
update public.profiles set avatar_url = 'https://img.test/ta.png' where id = tests.id('p:ta');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (tests.id('p:ta'), 'https://push.test/ta', 'k', 'a');
insert into public.notifications (recipient_id, kind) values (tests.id('p:ta'), 'test');
insert into public.takeover_requests (student_id, teacher_id) values (tests.id('s:su'), tests.id('p:ta'));

-- tc: teacher with no lessons but a free slot, who is also a student of ta and the parent of s3 -------------------------------
with s as (insert into public.students (profile_id, teacher_id) values (tests.id('p:tc'), tests.id('p:ta')) returning id)
select tests.reg('s:tc', id) from s;
insert into public.parents (profile_id) values (tests.id('p:tc'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:tc'), tests.id('s:s3'));
select tests.mkparent('ptc', 'Test', 'RoditeljTC', array['tc']);
select tests.mkparent('pj', 'Test', 'RoditeljJ', array['tc', 's2']);
select tests.mklesson('tc_solo', 'ta', 'math', 'L1', null, tests.at(100 * 60), 60, 'confirmed', 'teacher', array['tc']);
select tests.mklesson('tc_group', 'ta', 'math', 'L1', null, tests.at(120 * 60), 60, 'confirmed', 'teacher', array['s1', 'tc']);
select tests.mklesson('tc_slot', 'tc', 'math', 'L1', null, tests.at(24 * 60), 60, 'open', 'slot');

-- te: teacher whose only lesson started 15 minutes ago; also a student of tb and a parent of s1 -----------------------------
select tests.mkteacher('te', 'Test', 'Epsilon', array['math']);
select tests.mkstudent('sz', 'Test', 'Zeta', 'te');
with s as (insert into public.students (profile_id, teacher_id) values (tests.id('p:te'), tests.id('p:tb')) returning id)
select tests.reg('s:te', id) from s;
insert into public.parents (profile_id) values (tests.id('p:te'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:te'), tests.id('s:s1'));
select tests.mklesson('te_started', 'te', 'math', 'L1', null, tests.at(-15), 60, 'confirmed', 'teacher', array['sz']);
select tests.mklesson('tb_past', 'tb', 'phys', 'L2', 'R3', tests.at(-48 * 60), 60, 'confirmed', 'teacher', array['s3', 'te']);
select tests.mklesson('tb_te_solo', 'tb', 'phys', 'L2', null, tests.at(10 * 60), 60, 'confirmed', 'teacher', array['te']);
select tests.mklesson('tb_te_group', 'tb', 'phys', 'L2', null, tests.at(12 * 60), 60, 'confirmed', 'teacher', array['s3', 'te']);
select tests.mklesson('tb_te_past', 'tb', 'phys', 'L2', null, tests.at(-72 * 60), 60, 'confirmed', 'teacher', array['te']);
select tests.mklesson('tb_te_slot', 'tb', 'phys', 'L2', null, tests.at(14 * 60), 60, 'confirmed', 'slot', array['te']);

-- who may erase -------------------------------------------------------------------------------------------------------------
select tests.login_as('tb');
select throws_ok($$ select public.erase_teacher(tests.id('p:ta')) $$, 'PT403', null, 'a teacher cannot erase a colleague');
select tests.login_as('ta');
select throws_ok($$ select public.erase_teacher(tests.id('p:ta')) $$, 'PT403', null, 'nor themselves');
select tests.login_as('s1');
select throws_ok($$ select public.erase_teacher(tests.id('p:ta')) $$, 'PT403', null, 'a student cannot');
select tests.login_as('p1');
select throws_ok($$ select public.erase_teacher(tests.id('p:ta')) $$, 'PT403', null, 'nor a parent');
select tests.login_as('outsider');
select throws_ok($$ select public.erase_teacher(tests.id('p:ta')) $$, 'PT403', null, 'nor an unknown Google account');
select tests.login_anon();
select throws_ok($$ select public.erase_teacher(tests.id('p:ta')) $$, '42501', null, 'nor anon');

select tests.login_as('admin');
select throws_ok($$ select public.erase_teacher(gen_random_uuid()) $$, 'PT404', null, 'an unknown person');
select throws_ok($$ select public.erase_teacher(tests.id('p:s1')) $$, 'PT404', null, 'someone who is not a teacher');
select throws_ok($$ select public.erase_teacher(tests.id('p:admin')) $$, 'PT404', null, 'an administrator without a teacher role');
select throws_ok($$ select public.erase_teacher(tests.id('p:boss')) $$, 'PT409', null, 'an administrator who teaches is never erased this way');
select tests.logout();
select is((select count(*)::int from public.profiles where id = any (array[tests.id('p:s1'), tests.id('p:admin'), tests.id('p:boss'), tests.id('p:ta')])), 4, 'the refusals changed nothing');
select is((select count(*)::int from public.profiles where erased_at is not null and id = any (tests.ids('p:'))), 0, 'and erased nobody');

-- tc: no lesson of their own took place, so nothing is left of the profile ----------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.deactivate_teacher(tests.id('p:tc')) $$, 'a deactivated teacher can be erased as well');
select is(public.erase_teacher(tests.id('p:tc')), 'deleted', 'a teacher without lessons that took place is deleted completely');
select tests.logout();
select is(pg_temp.roles_of('tc'), 'none', 'the old Google account is an unknown account now');

select is((select count(*)::int from public.profiles where id = tests.id('p:tc')), 0, 'tc: the profile is gone');
select is((select count(*)::int from public.teachers where profile_id = tests.id('p:tc')), 0, 'tc: the teacher record is gone');
select is((select count(*)::int from public.teacher_subjects where teacher_id = tests.id('p:tc')), 0, 'tc: the subjects are gone');
select is((select count(*)::int from public.students where id = tests.id('s:tc')), 0, 'tc: the student record is gone');
select is((select count(*)::int from public.parents where profile_id = tests.id('p:tc')), 0, 'tc: the parent role is gone');
select is((select count(*)::int from public.parent_students where student_id = tests.id('s:tc') or parent_id = tests.id('p:tc')), 0, 'tc: no parent links are left on either side');
select is((select count(*)::int from auth.users where id = tests.id('u:tc')), 1, 'tc: the Google account itself is left alone');
select is((select count(*)::int from public.lessons where id = any (array[tests.id('les:tc_solo'), tests.id('les:tc_slot')])), 0, 'tc: their free slot and the lesson they alone attended are gone');
select is((select count(*)::int from public.lessons where id = tests.id('les:tc_group')), 1, 'tc: a lesson with other students goes on');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:tc_group')), 1, 'tc: without the erased student');
select is(tests.notified('tc_solo', 'cancelled'), array['pj', 'ptc', 'ta'], 'tc: the cancelled lesson is announced to the teacher and the parents');
select is(tests.notified_left('tc_group'), array['pj', 'ptc', 'ta'], 'tc: and the teacher and parents are told who left the group');
select is((select count(*)::int from public.parents where profile_id = tests.id('p:ptc')), 0, 'tc: a parent with no children left loses the parent role');
select is((select count(*)::int from public.profiles where id = tests.id('p:ptc')), 1, 'tc: but stays as a person');
select is((select count(*)::int from public.parent_students where parent_id = tests.id('p:pj') and student_id = tests.id('s:s2')), 1, 'tc: a parent who has other children keeps them');
select is((select count(*)::int from public.parents where profile_id = tests.id('p:pj')), 1, 'tc: and the parent role');
select is(
  (select teacher_id from public.students where id = tests.id('s:s3')) = tests.id('p:tb')
    and exists (select 1 from public.parent_students where parent_id = tests.id('p:p1') and student_id = tests.id('s:s3')),
  true, 'tc: the child they were a parent of is untouched'
);

select tests.login_as('tb');
select lives_ok($$ select public.add_student('tc@t.test', 'Test', 'Novi') $$, 'tc: the freed email can be added again, as a plain student');
select tests.logout();
select isnt((select id from public.profiles where email = 'tc@t.test'), tests.id('p:tc'), 'tc: as a new profile');

-- ta: a lesson took place, so the profile stays as a record -----------------------------------------------------------------
select tests.login_as('admin');
select is(public.erase_teacher(tests.id('p:ta')), 'kept_history', 'a teacher with lessons that took place is kept as a record');
select tests.logout();
select is((select first_name || ' ' || last_name from public.profiles where id = tests.id('p:ta')), 'Test Alfa', 'ta: the name stays, so the admin can tell who taught');
select ok(
  (select email like 'erased-%@erased.invalid' and email <> 'ta@t.test' from public.profiles where id = tests.id('p:ta')),
  'ta: the email is replaced by a placeholder, so the real one is free'
);
select is((select user_id from public.profiles where id = tests.id('p:ta')), null::uuid, 'ta: the Google account is detached');
select is((select avatar_url from public.profiles where id = tests.id('p:ta')), null::text, 'ta: the picture is gone');
select ok((select erased_at is not null and not is_admin from public.profiles where id = tests.id('p:ta')), 'ta: the profile is marked as erased');
select is(pg_temp.roles_of('ta'), 'none', 'ta: the old Google account is an unknown account now');
select is(
  (select is_active::text || '/' || coalesce(bio, '-') || '/' || coalesce(photo_path, '-') from public.teachers where profile_id = tests.id('p:ta')),
  'false/-/-', 'ta: the teacher record stays, inactive and without personal text or photo'
);
select is((select count(*)::int from public.teacher_subjects where teacher_id = tests.id('p:ta')), 0, 'ta: the subjects are gone');
select is((select count(*)::int from public.teacher_cv where teacher_id = tests.id('p:ta')), 0, 'ta: the CV is gone');
select is(
  (select (select count(*) from public.cv_experience where cv_id = tests.id('cv:ta'))
        + (select count(*) from public.cv_education where cv_id = tests.id('cv:ta'))
        + (select count(*) from public.cv_skills where cv_id = tests.id('cv:ta')))::int,
  0, 'ta: and everything in it'
);
select is((select count(*)::int from public.push_subscriptions where profile_id = tests.id('p:ta')), 0, 'ta: their devices are gone');
select is((select count(*)::int from public.notifications where recipient_id = tests.id('p:ta')), 0, 'ta: and the notices waiting for them');
select is(
  (select status::text from public.takeover_requests where student_id = tests.id('s:su') and teacher_id = tests.id('p:ta')),
  'rejected', 'ta: their pending takeover request is closed'
);
select is((select count(*)::int from public.lessons where teacher_id = tests.id('p:ta') and start_at > now()), 0, 'ta: every lesson and slot still to come is gone');
select is((select count(*)::int from public.lessons where teacher_id = tests.id('p:ta')), 1, 'ta: the lesson that took place stays');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:past')), 1, 'ta: with its participant');
select is(
  (select count(*)::int from public.students where id = any (array[tests.id('s:s1'), tests.id('s:s2')]) and teacher_id is null),
  2, 'ta: the students are unassigned'
);
select is(tests.notified('group', 'teacher_deactivated'), array['p1', 'p2', 'pj', 's1', 's2', 'te'], 'ta: the participants and parents of the cancelled lessons are told, the teacher is not');

select tests.login_as('admin');
select is((select count(*)::int from public.lessons where id = tests.id('les:past')), 1, 'ta: the administrator still sees the lesson that took place');
select is(
  (select p.first_name || ' ' || p.last_name from public.lessons l join public.profiles p on p.id = l.teacher_id where l.id = tests.id('les:past')),
  'Test Alfa', 'ta: with the teacher''s name'
);
select throws_ok($$ select public.erase_teacher(tests.id('p:ta')) $$, 'PT409', null, 'an erased teacher cannot be erased again');
select throws_ok($$ select public.reactivate_teacher(tests.id('p:ta')) $$, 'PT409', null, 'nor brought back');
select throws_ok($$ select public.change_profile_email(tests.id('p:ta'), 'back@t.test') $$, 'PT409', null, 'nor given a new email');
select tests.login_as('s1');
select ok(tests.lesson_keys() @> array['les:past'], 'ta: the student who attended still sees the lesson');
select tests.logout();

-- te: a lesson that started 15 minutes ago is already history ---------------------------------------------------------------
select tests.login_as('admin');
select is(public.erase_teacher(tests.id('p:te')), 'kept_history', 'a lesson that has just started counts as having taken place');
select tests.logout();
select ok((select erased_at is not null from public.profiles where id = tests.id('p:te')), 'te: the profile is marked as erased');
select is(pg_temp.roles_of('te'), 'none', 'te: the old Google account is an unknown account now');
select is((select count(*)::int from public.lessons where id = tests.id('les:te_started')), 1, 'te: the lesson that started stays');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:te_started')), 1, 'te: with its participant');
select is((select teacher_id from public.students where id = tests.id('s:sz')), null::uuid, 'te: whose student is unassigned');
select is((select count(*)::int from public.students where id = tests.id('s:te')), 0, 'te: the student record is gone');
select is(
  (select array_agg(tests.key_of(student_id)) from public.lesson_students where lesson_id = tests.id('les:tb_past')),
  array['s:s3'], 'te: a past lesson of their teacher stays, without them'
);
select is(
  (select count(*)::int from public.lessons where id = tests.id('les:tb_te_past')) || '/'
    || (select count(*)::int from public.lesson_students where lesson_id = tests.id('les:tb_te_past')),
  '1/0', 'te: a past lesson they alone attended stays, without a participant'
);
select is(tests.notified_left('tb_past') || tests.notified('tb_te_past', 'cancelled'), '{}'::text[], 'te: nobody is told about lessons that already took place');
select is((select count(*)::int from public.lessons where id = tests.id('les:tb_te_solo')), 0, 'te: the lesson they alone were to attend is gone');
select is((select count(*)::int from public.lesson_students where lesson_id = tests.id('les:tb_te_group')), 1, 'te: and a group lesson goes on without them');
select is(
  (select status::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
     from public.lessons l where l.id = tests.id('les:tb_te_slot')),
  'open/0', 'te: a free slot they had booked is free again'
);
select is(tests.notified('tb_te_slot', 'cancelled'), array['tb'], 'te: and the teacher is told the booking is cancelled');
select is(tests.notified('tb_te_solo', 'cancelled'), array['tb'], 'te: the teacher is told about the cancelled lesson');
select is(tests.notified_left('tb_te_group'), array['tb'], 'te: and about the group lesson they left');
select is((select count(*)::int from public.parents where profile_id = tests.id('p:te')), 0, 'te: the parent role is gone');
select is(
  (select count(*)::int from public.parent_students where student_id = tests.id('s:s1')),
  1, 'te: the child keeps their other parent'
);
select is((select count(*)::int from public.notifications where recipient_id = tests.id('p:te')), 0, 'te: no notice is left waiting for the erased person');

select is((select count(*)::int from public.profiles where erased_at is not null and id = any (tests.ids('p:'))), 2, 'only the two teachers with lessons that took place are kept as records');
select is((select count(*)::int from public.profiles where id = tests.id('p:tc')), 0, 'and the one without is gone');

select * from finish();
rollback;
