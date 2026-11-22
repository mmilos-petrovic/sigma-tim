-- The administrator erases a student or a parent on their request (Phase 8d): everything about the person goes, the lessons
-- of other people stay, and the name inside notices written for others is blanked.
begin;
select plan(102);

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

create function pg_temp.has(p_key text) returns boolean
language sql stable as $$ select exists (select 1 from public.profiles where id = tests.id('p:' || p_key)) $$;

-- ea: a student of ta with parents pea (only parent of ea) and pe2 (also a parent of s2), a number, a device, a request ------
select tests.mkstudent('ea', 'Test', 'Eraser', 'ta');
select tests.mkparent('pea', 'Test', 'SamoRoditelj', array['ea']);
select tests.mkparent('pe2', 'Test', 'DvoDete', array['ea', 's2']);
insert into public.person_phones (profile_id, phone) values
  (tests.id('p:ea'), '+381601110001'), (tests.id('p:pea'), '+381601110002'), (tests.id('p:pe2'), '+381601110003');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (tests.id('p:ea'), 'https://push.test/ea', 'k', 'a');
insert into public.enrolment_requests (applicant_id, applicant_role, source, student_id, student_first_name, student_last_name)
values (tests.id('p:pea'), 'parent', 'legacy', tests.id('s:ea'), 'Dete', 'Upisano');

select tests.mklesson('ea_group', 'ta', 'math', 'L1', 'R1', tests.at(80 * 60), 60, 'confirmed', 'teacher', array['s1', 'ea']);
select tests.mklesson('ea_solo', 'ta', 'math', 'L1', 'R2', tests.at(90 * 60), 60, 'confirmed', 'teacher', array['ea']);
select tests.mklesson('ea_slot', 'ta', 'math', 'L1', null, tests.at(100 * 60), 60, 'confirmed', 'slot', array['ea']);
select tests.mklesson('ea_gone', 'ta', 'math', 'L1', 'R2', tests.at(-30 * 60), 60, 'confirmed', 'teacher', array['ea']);
select tests.mklesson('ea_held', 'ta', 'math', 'L1', 'R2', tests.at(-60 * 60), 60, 'confirmed', 'teacher', array['ea']);
select tests.mklesson('ea_held_group', 'ta', 'math', 'L1', 'R1', tests.at(-72 * 60), 60, 'confirmed', 'teacher', array['s1', 'ea']);
update public.lessons set outcome = 'held' where id = any (array[tests.id('les:ea_held'), tests.id('les:ea_held_group')]);
update public.lesson_students set paid_at = now() where lesson_id = tests.id('les:ea_held');

-- notices written for other people that name ea, one that names somebody else, and one of ea's own
insert into public.notifications (recipient_id, kind, payload, sent_at, channel) values
  (tests.id('p:ta'), 'participant_left',
   jsonb_build_object('students', jsonb_build_array('Test Eraser', 'Test Prvi'), 'actor', tests.id('p:ea'), 'lesson_id', tests.id('les:ea_held_group')),
   now(), 'email'),
  (tests.id('p:ta'), 'participant_left',
   jsonb_build_object('students', jsonb_build_array('Test Prvi'), 'actor', tests.id('p:s1'), 'lesson_id', tests.id('les:ea_held_group')),
   now(), 'email'),
  (tests.id('p:ta'), 'enrolment_chosen', jsonb_build_object('student', 'Dete Upisano', 'subject', 'Test Matematika'), null, null),
  (tests.id('p:ea'), 'test', '{}', null, null);

-- other people the tests need ----------------------------------------------------------------------------------------------
select tests.mkstudent('tw', 'Test', 'Dvojnik', 'ta');
insert into public.students (profile_id, teacher_id) values (tests.id('p:tw'), tests.id('p:tb'));
select tests.mkparent('ptw', 'Test', 'RoditeljDvojnika', array['tw']);
select tests.mklesson('tw_ta', 'ta', 'math', 'L1', 'R2', tests.at(110 * 60), 60, 'confirmed', 'teacher', array['tw']);
with l as (
  insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
  values (tests.id('p:tb'), tests.id('subj:phys'), tests.id('loc:L2'), tests.at(110 * 60), tests.at(110 * 60 + 60), 'confirmed', 'teacher')
  returning id
), ls as (
  insert into public.lesson_students (lesson_id, student_id)
  select l.id, s.id from l, public.students s where s.profile_id = tests.id('p:tw') and s.teacher_id = tests.id('p:tb')
)
select tests.reg('les:tw_tb', id) from l;

select tests.mkperson('nobody', 'Test', 'BezUloge');
select tests.mkparent('pfree', 'Test', 'BezDece', '{}');
insert into public.person_phones (profile_id, phone) values (tests.id('p:pfree'), '+381601110004');
select tests.mkstudent('sp', 'Test', 'Student', 'ta');
insert into public.parents (profile_id) values (tests.id('p:sp'));
insert into public.parent_students (parent_id, student_id) values (tests.id('p:sp'), tests.id('s:s3'));

-- a parent who is also an administrator, a teacher or a student keeps the profile when the child goes
select tests.mkstudent('ex1', 'Test', 'Prvi Izbrisan', 'ta');
select tests.mkstudent('ex2', 'Test', 'Drugi Izbrisan', 'ta');
select tests.mkstudent('ex3', 'Test', 'Treci Izbrisan', 'ta');
select tests.mkstudent('sq', 'Test', 'Studentkinja', 'ta');
insert into public.parents (profile_id) values (tests.id('p:admin')), (tests.id('p:tc')), (tests.id('p:sq'));
insert into public.parent_students (parent_id, student_id) values
  (tests.id('p:admin'), tests.id('s:ex1')), (tests.id('p:tc'), tests.id('s:ex2')), (tests.id('p:sq'), tests.id('s:ex3'));

-- a lesson that started without being recorded, with ea and another student on it
select tests.mklesson('ea_past_group', 'ta', 'math', 'L1', 'R1', tests.at(-100 * 60), 60, 'confirmed', 'teacher', array['s1', 'ea']);

-- a parent without children and a student with the same name, and a notice naming the student
select tests.mkparent('pn', 'Test', 'Istoimeni', '{}');
select tests.mkstudent('ns', 'Test', 'Istoimeni', 'ta');
insert into public.notifications (recipient_id, kind, payload, sent_at, channel) values
  (tests.id('p:ta'), 'participant_left', jsonb_build_object('students', jsonb_build_array('Test Istoimeni')), now(), 'email'),
  (tests.id('p:ta'), 'enrolment_chosen',
   jsonb_build_object('student', (select r.student_first_name || ' ' || r.student_last_name from public.enrolment_requests r where r.student_id = tests.id('s:su'))),
   null, null);

-- two children with different first and last names, for the sort order of the list
select tests.mkstudent('k1', 'Boris', 'Zec', 'ta');
select tests.mkstudent('k2', 'Ana', 'Alic', 'ta');
select tests.mkparent('pk', 'Test', 'DvaDeteta', array['k1', 'k2']);

select tests.mkteacher('tz', 'Test', 'Zeta', array['math']);
select tests.mkstudent('sz', 'Test', 'Zetin', 'tz');
select tests.mklesson('tz_started', 'tz', 'math', 'L1', null, tests.at(-15), 60, 'confirmed', 'teacher', array['sz']);

-- who may erase -------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.erase_person(tests.id('p:ea')) $$, 'PT403', null, 'the teacher of the student cannot');
select tests.login_as('s1');
select throws_ok($$ select public.erase_person(tests.id('p:ea')) $$, 'PT403', null, 'a student cannot');
select throws_ok($$ select public.erase_person(tests.id('p:s1')) $$, 'PT403', null, 'not even themselves');
select tests.login_as('p1');
select throws_ok($$ select public.erase_person(tests.id('p:ea')) $$, 'PT403', null, 'a parent cannot');
select tests.login_as('outsider');
select throws_ok($$ select public.erase_person(tests.id('p:ea')) $$, 'PT403', null, 'an unknown Google account cannot');
select tests.login_anon();
select throws_ok($$ select public.erase_person(tests.id('p:ea')) $$, '42501', null, 'anon cannot');
select tests.logout();
select ok(not has_function_privilege('authenticated', 'private.leave_future_lessons(uuid[])', 'execute'), 'the helper that leaves lessons is not callable');
select ok(not has_function_privilege('authenticated', 'private.blank_person_in_payload(jsonb, text[], uuid)', 'execute'), 'nor the one that blanks a name');

-- what is refused -------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select throws_ok($$ select public.erase_person(gen_random_uuid()) $$, 'PT404', 'person not found', 'an unknown person');
select throws_ok($$ select public.erase_person(tests.id('p:admin')) $$, 'PT409', 'an administrator cannot be erased', 'an administrator');
select throws_ok($$ select public.erase_person(tests.id('p:boss')) $$, 'PT409', 'an administrator cannot be erased', 'an administrator who teaches');
select throws_ok($$ select public.erase_person(tests.id('p:ta')) $$, 'PT409', 'a teacher is erased as a teacher', 'a teacher: that is erase_teacher');
select throws_ok($$ select public.erase_person(tests.id('p:p1')) $$, 'PT409',
  'a parent with children cannot be erased: erase or unlink the children first', 'a parent who still has children');
select throws_ok($$ select public.erase_person(tests.id('p:sp')) $$, 'PT409',
  'a parent with children cannot be erased: erase or unlink the children first', 'also a student who is a parent of somebody');
select is(public.erase_teacher(tests.id('p:tz')), 'kept_history', 'setup: tz is erased as a teacher and kept as a record');
select throws_ok($$ select public.erase_person(tests.id('p:tz')) $$, 'PT409', 'this person was already erased', 'a record that was erased already');
select tests.logout();
select ok(pg_temp.has('p1') and pg_temp.has('sp') and pg_temp.has('ta') and pg_temp.has('boss'), 'the refusals deleted nobody');
select is((select count(*)::int from public.students where profile_id = tests.id('p:sp')), 1, 'and kept the student record of the parent');

-- ea: a student with lessons of every kind ------------------------------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.erase_person(tests.id('p:ea')) $$, 'the administrator erases a student');
select tests.logout();

select is((select count(*)::int from public.profiles where id = tests.id('p:ea')), 0, 'ea: the profile is gone');
select is((select count(*)::int from public.students where id = tests.id('s:ea')), 0, 'ea: the student record is gone');
select is((select count(*)::int from auth.users where id = tests.id('u:ea')), 0, 'ea: the Google account is deleted');
select is(pg_temp.roles_of('ea'), 'none', 'ea: the old sign-in is nobody');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:ea')), 0, 'ea: the number is gone');
select is((select count(*)::int from public.push_subscriptions where profile_id = tests.id('p:ea')), 0, 'ea: the devices are gone');
select is((select count(*)::int from public.notifications where recipient_id = tests.id('p:ea')), 0, 'ea: the notices written for them are gone');
select is((select count(*)::int from public.enrolment_requests where student_id = tests.id('s:ea')), 0, 'ea: the request with the typed data is gone');
select is((select count(*)::int from public.lesson_students where student_id = tests.id('s:ea')), 0, 'ea: on no lesson any more');

select is((select count(*)::int from public.lessons where id = tests.id('les:ea_group')), 1, 'a group lesson goes on');
select is((select array_agg(tests.key_of(s.profile_id)) from public.lesson_students ls join public.students s on s.id = ls.student_id
            where ls.lesson_id = tests.id('les:ea_group')), array['p:s1'], 'without ea');
-- pea was told as well, but is deleted below (nothing else is left of them) and the notice goes with the profile
select is(tests.notified('ea_group', 'cancelled'), '{}'::text[], 'a group lesson that goes on is not announced as cancelled');
select is(tests.notified_left('ea_group'), array['pe2', 'ta'], 'the teacher and the parents are told that ea left it');
select is((select count(*)::int from public.lessons where id = tests.id('les:ea_solo')), 0, 'a lesson only ea attended is cancelled');
select is(tests.notified('ea_solo', 'cancelled'), array['pe2', 'ta'], 'and announced');
select is((select status::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
             from public.lessons l where l.id = tests.id('les:ea_slot')), 'open/0', 'the free slot ea had booked is free again');
select is((select count(*)::int from public.lessons where id = tests.id('les:ea_past_group')), 1, 'a lesson that started and was not recorded stays when somebody else was on it');
select is((select count(*)::int from public.lessons where id = tests.id('les:ea_gone')), 0, 'a lesson that started, was not recorded and had only ea is deleted');
select is((select outcome::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
             from public.lessons l where l.id = tests.id('les:ea_held')), 'held/0', 'a lesson that took place stays on the teacher''s record, empty');
select is((select outcome::text || '/' || (select count(*) from public.lesson_students where lesson_id = l.id)
             from public.lessons l where l.id = tests.id('les:ea_held_group')), 'held/1', 'a lesson that took place with another student stays with them');
select is((select tests.key_of(s.profile_id) from public.lesson_students ls join public.students s on s.id = ls.student_id
            where ls.lesson_id = tests.id('les:ea_held_group')), 'p:s1', 'the other student is still on it');

select is((select count(*)::int from public.notifications where payload::text like '%Test Eraser%'), 0, 'no notice names ea any more');
select is((select count(*)::int from public.notifications where payload::text like '%Dete Upisano%'), 0, 'nor the name typed on the request');
select is(
  (select payload -> 'students' from public.notifications
    where recipient_id = tests.id('p:ta') and payload ->> 'lesson_id' = tests.id('les:ea_held_group')::text and not (payload ? 'actor')
      and jsonb_array_length(payload -> 'students') = 2),
  '["izbrisana osoba", "Test Prvi"]'::jsonb, 'the name is replaced where it was, the other names stay, and the order too'
);
select is(
  (select payload ->> 'student' from public.notifications where recipient_id = tests.id('p:ta') and kind = 'enrolment_chosen' and payload ->> 'subject' = 'Test Matematika'),
  'izbrisana osoba', 'a single name is replaced as well');
select is(
  (select (payload ->> 'actor') from public.notifications
    where recipient_id = tests.id('p:ta') and payload -> 'students' = '["Test Prvi"]'::jsonb),
  tests.id('p:s1')::text, 'a notice about somebody else keeps its actor');
select is(
  (select count(*)::int from public.notifications where payload ->> 'actor' = tests.id('p:ea')::text), 0,
  'no notice points at ea as the one who acted');

select is((select count(*)::int from public.notifications n
            where n.payload ->> 'student' = (select r.student_first_name || ' ' || r.student_last_name from public.enrolment_requests r
                                              where r.student_id = tests.id('s:su'))), 1,
  'the name typed on the request of another student is left alone');
select is(pg_temp.has('pea'), false, 'pea: a parent whose only child was erased is gone with the role');
select is((select count(*)::int from auth.users where id = tests.id('u:pea')), 1, 'pea: but their Google account is not touched, nobody asked for that');
select is(pg_temp.has('pe2'), true, 'pe2: a parent with another child stays');
select is((select count(*)::int from public.parent_students where parent_id = tests.id('p:pe2') and student_id = tests.id('s:s2')), 1, 'pe2: with that child');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:pe2')), 1, 'pe2: and the number');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:pea')), 0, 'pea: the number of the deleted parent went with them');

select tests.login_as('ta');
select lives_ok($$ select public.add_student('ea@t.test', 'Test', 'Novi') $$, 'ea: the address can be added again');
select tests.logout();
select isnt((select id from public.profiles where email = 'ea@t.test'), tests.id('p:ea'), 'ea: as a new person');
select is((select count(*)::int from auth.users where email = 'ea@t.test'), 0, 'ea: with no sign-in until they sign in again');

select tests.login_as('admin');
select throws_ok($$ select public.erase_person(tests.id('p:ea')) $$, 'PT404', 'person not found', 'erasing the same person twice finds nobody');
select tests.logout();

-- a parent with no children whose name a student has too: the student's name stays in the notices
select tests.login_as('admin');
select lives_ok($$ select public.erase_person(tests.id('p:pn')) $$, 'pn: a parent with no children is erased');
select tests.logout();
select is((select count(*)::int from public.notifications where payload::text like '%Test Istoimeni%'), 1,
  'pn: a student with the same name is still named in the notice');

-- a parent who is an administrator, a teacher or a student keeps the profile
select tests.login_as('admin');
select lives_ok($$ select public.erase_person(tests.id('p:ex1')) $$, 'ex1: the child of an administrator');
select lives_ok($$ select public.erase_person(tests.id('p:ex2')) $$, 'ex2: the child of a teacher');
select lives_ok($$ select public.erase_person(tests.id('p:ex3')) $$, 'ex3: the child of a student');
select tests.logout();
select is(pg_temp.has('admin') and pg_temp.has('tc') and pg_temp.has('sq'), true, 'the administrator, the teacher and the student are all still there');
select is((select count(*)::int from public.parents where profile_id = any (array[tests.id('p:admin'), tests.id('p:tc'), tests.id('p:sq')])), 0,
  'without the parent role');

-- tw: one person with two student records (two teachers), a parent for both ------------------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.erase_person(tests.id('p:tw')) $$, 'a person with records at two teachers');
select tests.logout();
select is((select count(*)::int from public.students where profile_id = tests.id('p:tw')), 0, 'tw: both records are gone');
select is((select count(*)::int from public.lessons where id = tests.id('les:tw_ta')), 0, 'tw: the lesson with the first teacher is cancelled');
select is((select count(*)::int from public.lessons where id = tests.id('les:tw_tb')), 0, 'tw: and the one with the second');
select is(pg_temp.has('ptw'), false, 'tw: the parent of both records is gone');
select is((select count(*)::int from auth.users where id = tests.id('u:tw')), 0, 'tw: one Google account is deleted');

-- a person with no role (a sign-up that never got further) and a parent with no children --------------------------------------------------
select tests.login_as('admin');
select lives_ok($$ select public.erase_person(tests.id('p:nobody')) $$, 'a person with no role');
select lives_ok($$ select public.erase_person(tests.id('p:pfree')) $$, 'a parent with no children');
select tests.logout();
select is(pg_temp.has('nobody') or pg_temp.has('pfree'), false, 'both are gone');
select is((select count(*)::int from auth.users where id = any (array[tests.id('u:nobody'), tests.id('u:pfree')])), 0, 'with their Google accounts');
select is((select count(*)::int from public.person_phones where profile_id = tests.id('p:pfree')), 0, 'and the number');

-- a parent is refused until the children are unlinked, then erased -----------------------------------------------------------------------
select tests.login_as('admin');
select throws_ok($$ select public.erase_person(tests.id('p:p2')) $$, 'PT409', null, 'p2: refused while the child is linked');
select is(pg_temp.has('p2') and (select count(*) from public.parent_students where parent_id = tests.id('p:p2')) = 1, true, 'p2: and nothing changed');
select lives_ok($$ select public.remove_parent_from_student(tests.id('s:s2'), tests.id('p:p2')) $$, 'the administrator unlinks the child');
select lives_ok($$ select public.erase_person(tests.id('p:p2')) $$, 'p2: now the person can be erased');
select tests.logout();
select is(pg_temp.has('p2'), false, 'p2: gone');
select is((select count(*)::int from auth.users where id = tests.id('u:p2')), 0, 'p2: with the Google account');
select is((select count(*)::int from public.students where id = tests.id('s:s2')), 1, 'p2: the child is untouched');

-- su: a student nobody teaches, with the request the system made for them ------------------------------------------------------------------
select is((select count(*)::int from public.enrolment_requests where student_id = tests.id('s:su')), 1, 'su: has a request');
select tests.login_as('admin');
select lives_ok($$ select public.erase_person(tests.id('p:su')) $$, 'su: erased');
select tests.logout();
select is((select count(*)::int from public.enrolment_requests where student_id = tests.id('s:su') or applicant_id = tests.id('p:su')), 0, 'su: the request is gone');
select is(pg_temp.has('pu'), false, 'su: and so is the parent whose only child they were');

-- a name inside a notice ----------------------------------------------------------------------------------------------------------------
select is(
  private.blank_person_in_payload(
    jsonb_build_object('students', jsonb_build_array('A B', 'C D', 'A B'), 'student', 'A B', 'actor', tests.id('p:s1'), 'subject', 'A B'),
    array['A B'], tests.id('p:s1')),
  '{"students": ["izbrisana osoba", "C D", "izbrisana osoba"], "student": "izbrisana osoba", "subject": "A B"}'::jsonb,
  'every name is replaced, the actor is removed, other fields stay');
select is(
  private.blank_person_in_payload(jsonb_build_object('students', jsonb_build_array('C D'), 'student', 'C D', 'actor', tests.id('p:s2')),
    array['A B'], tests.id('p:s1')),
  jsonb_build_object('students', jsonb_build_array('C D'), 'student', 'C D', 'actor', tests.id('p:s2')),
  'a notice that does not name the person is returned as it was');
select is(private.blank_person_in_payload('{"students": "A B", "student": ["A B"]}', array['A B'], tests.id('p:s1')),
  '{"students": "A B", "student": ["A B"]}'::jsonb, 'a field of another shape is left alone');
select is(private.blank_person_in_payload('{"students": []}', array['A B'], tests.id('p:s1')), '{"students": []}'::jsonb, 'an empty list stays empty');
select is(private.blank_person_in_payload('{}', '{}', tests.id('p:s1')), '{}'::jsonb, 'an empty notice stays empty');
select is(private.blank_person_in_payload('{"students": [1, "A B"]}', array['A B'], tests.id('p:s1')),
  '{"students": [1, "izbrisana osoba"]}'::jsonb, 'something that is not a name in the list is kept');

-- the administrator's list of parents ---------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select * from public.admin_list_parents() $$, 'PT403', null, 'a teacher cannot list the parents');
select tests.login_as('p1');
select throws_ok($$ select * from public.admin_list_parents() $$, 'PT403', null, 'nor a parent');
select tests.login_anon();
select throws_ok($$ select * from public.admin_list_parents() $$, '42501', null, 'nor anon');
select tests.login_as('admin');
select is((select array_agg(tests.key_of(profile_id) order by tests.key_of(profile_id)) from public.admin_list_parents()
            where tests.key_of(profile_id) is not null), array['p:p1', 'p:pe2', 'p:pk', 'p:sp'], 'it lists the people who are parents');
select is((select child_names from public.admin_list_parents() where profile_id = tests.id('p:p1')),
  array['Test Prvi', 'Test Treci'], 'with their children, in name order');
select is((select child_names from public.admin_list_parents() where profile_id = tests.id('p:pk')), array['Ana Alic', 'Boris Zec'],
  'sorted by last name');
select is((select child_names from public.admin_list_parents() where profile_id = tests.id('p:pe2')), array['Test Drugi'],
  'a parent keeps only the children that are left');
select tests.logout();

-- nothing else was touched ------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.profiles where id = any (array[tests.id('p:s1'), tests.id('p:s2'), tests.id('p:s3'), tests.id('p:sb'),
  tests.id('p:p1'), tests.id('p:ta'), tests.id('p:tb'), tests.id('p:tc'), tests.id('p:boss'), tests.id('p:admin')])), 10,
  'the other people are all still there');
select is((select count(*)::int from auth.users where id = tests.id('u:s1')), 1, 'and their Google accounts');
select is((select count(*)::int from public.lessons where id = any (tests.ids('les:')) and teacher_id = tests.id('p:tb')), 1,
  'the lesson of tb that was not about an erased person is still there');

select * from finish();
rollback;
